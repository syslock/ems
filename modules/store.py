import time, itertools, cgi, json
from lib import user
from lib import errors
from lib import db_object
from lib import publication
from lib import files

def process( app ):
	"""Speichert neue Datenobjekte (Texte bzw. Textbestandteile, später evtl. 
		Bilder, Videos etc. Objekte sind in einer Baumstruktur angeordet, können also 
		Eltern und Kinder haben, sodass sich komplexe Objekte aus atomaren zusammen 
		setzen lassen (Beiträge aus Absätzen, Bildern, Videos etc.). Objekte haben einen 
		eindeutigen von ihrer Baumposition unabhängigen Schlüssel. Objekte haben einen 
		Datentyp, der vermutlich Einschränkungen über Nachbarschaftsbeziehungen zu 
		anderen typisierten Objekten mit sich bringt und zur korrekten Anzeige auf 
		Clients benötigt wird. Objekte können Zugriffslisten (lesen/schreiben) haben. 
		Falls ein Objekt keine eigenen Zugriffslisten hat, erbt es die nächst höheren 
		innerhalb des Baumes. Zugriffslisten sind selbst Gruppenobjekte die eine Menge 
		von Nutzerobjekten (oder anderen Gruppenobjekten?) beinhalten."""
	query = app.query
	response = app.response
	session = app.session
	if query.content_media_type in ["multipart/form-data"]:
		# Speichern eines oder mehrerer Objekte aus einem multipart/form-data-Streams:
		# FIXME: FieldStorage speichert die aus dem Stream geparsten Objekte an unbekannter Stelle zwischen.
		#        Um Kontrolle über Speicherort und den Fortschritt größer Datentransfers zu haben, sollten
		#        wir den Stream vielleicht selbst parsen oder entsprechende Option von FieldStorage suchen!
		fs = cgi.FieldStorage( fp=query.environ['wsgi.input'], environ=query.environ )
		for i, form_key in enumerate(fs.keys()):
			item = fs[ form_key ]
			if type(item)==cgi.FieldStorage and item.file:
				store_object( app, item )
	else:
		# Speichern eines einzelnen Objektes aus Request-Parametern:
		store_object( app )
				
def store_object( app, file_item=None ):
	query = app.query
	response = app.response
	session = app.session
	request_media_type = None
	if "type" in query.parms:
		request_media_type = query.parms["type"]
	title = None
	if "title" in query.parms:
		title = query.parms["title"]
	data = None
	if "data" in query.parms:
		data = query.parms["data"]
	if file_item!=None:
		request_media_type = file_item.type
		title = file_item.filename
		data = file_item.file
	# FIXME: Hier blacklisten wir kritische Objekttypen vor unautorisierter
	# Erstellung (z.B. x-obj.user). Sicherer, aber im Prototyping unpraktischer 
	# wär es unkritische Objekttypen zu whitelisten.
	if request_media_type == user.User.media_type and not "id" in query.parms:
		raise NotImplementedError( "Missing feature" ) # TODO
		c = app.db.cursor()
		c.execute( """select count(*) from privileges 
						where privilege=? and object_id=?""",
					['create_user', app.user.id] )
		if( c.fetchone()!=1 ):
			raise errors.PrivilegeError()
		if "nick" in query.parms and "password" in query.parms \
		and "email" in query.parms and "fullname" in query.parms:
			usr = user.User( app = app,
								nick = query.parms["nick"], 
								plain_password = query.parms["password"],
								email = query.parms["email"], 
								fullname = query.parms["fullname"] )
			response.output = json.dumps( {"succeeded" : True,
									"id" : usr.id} )
		else:
			raise errors.ParameterError()
	else:
		if "id" in query.parms:
			object_id_list = [ int(x) for x in query.parms["id"].split(",") ]
			for object_id in object_id_list:
				if not app.user.can_write( object_id ):
					raise errors.PrivilegeError()
		else:
			object_id_list = [None]
		parent_id = None
		if "parent_id" in query.parms:
			parent_id = [ int(x) for x in query.parms["parent_id"].split(",") ]
		sequence = 0
		if "sequence" in query.parms:
			sequence = int( query.parms["sequence"] )
		store_id_list = []
		for object_id in object_id_list:
			# Falls mehrere Objekt-IDs unter einer Parent-ID gespeichert werden sollen,
			# können die einzelnen Objekt-Medientypen abweichen, weshalb bei solchen
			# Requests kein Medientyp mitgegeben und dieser für die einzelnen Objekte
			# aus der Datenbank abgefragt wird.
			media_type = request_media_type
			if not media_type:
				# nicht explizit angegebenen media_type aus dem DBObject holen:
				obj = db_object.DBObject( app, object_id=object_id )
				media_type = obj.media_type
			obj = None
			if file_item!=None:
				# Es ist denkbar von File abgeleiteten Klassen mit festem media_type, zusätzlichen Attributen oder 
				# besonderen Speicheranforderungen den Vorrang vor diesem generischen Fallback zu geben:
				file_class = files.File
				if files.Image.supports( app, media_type ):
					file_class = files.Image
				obj = file_class( app, object_id=object_id, parent_id=parent_id, media_type=media_type, sequence=sequence )
				# Chunk-Position parsen, falls vorhanden:
				try:
					chunk_name, chunk_start, chunk_end_exclusive, file_expected_size = file_item.name.split(":")
				except ValueError:
					pass
				else:
					query.parms.update( {
						"chunk_name" : chunk_name,
						"chunk_start" : int( chunk_start ),
						"chunk_end" : int(chunk_end_exclusive) - 1,
						"chunk_size" : int(chunk_end_exclusive) - int(chunk_start),
						"file_expected_size" : int( file_expected_size )} )
			elif files.Image.supports( app, media_type ):
				obj = files.Image( app, object_id=object_id, parent_id=parent_id, sequence=sequence )
			elif media_type == db_object.Text.media_type:
				obj = db_object.Text( app, object_id=object_id, parent_id=parent_id, sequence=sequence )
			elif media_type == db_object.HTML.media_type:
				obj = db_object.HTML( app, object_id=object_id, parent_id=parent_id, sequence=sequence )
			elif media_type == user.User.media_type and object_id:
				obj = user.User( app, user_id=object_id )
			elif media_type == publication.Publication.media_type:
				obj = publication.Publication( app, object_id=object_id, parent_id=parent_id, sequence=sequence )
			elif media_type == db_object.Minion.media_type:
				obj = db_object.Minion( app, object_id=object_id, parent_id=parent_id, sequence=sequence )
			else:
				# FIXME: use DBObject.create_typed_object()?
				obj = db_object.DBObject( app, object_id=object_id, 
										parent_id=parent_id, 
										media_type=media_type,
										sequence=sequence )
			obj.update( **dict(itertools.chain( 
							query.parms.items(),
							{"parent_id":parent_id, "data":data, "title":title, 
								"sequence":sequence}.items(),
							)) )
			store_id_list.append( obj.id );
		if len(store_id_list):
			response.output = json.dumps( {"succeeded" : True, 
									"id" : store_id_list if len(store_id_list)>1 else store_id_list[0]} )
		else:
			raise errors.StateError( _("Nothing Stored") )
