import time, imp, itertools
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
from iswi import profile
profile = imp.reload( profile )

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
	if "user_id" in session.parms:
		usr = user.User( app, user_id=int(session.parms["user_id"]) )
	else:
		usr = user.get_anonymous_user( app )
	if not usr:
		raise errors.AuthenticationNeeded()
	media_type = None
	if "type" in query.parms:
		media_type = query.parms["type"]
	# FIXME: Hier blacklisten wir kritische Objekttypen vor unautorisierter
	# Erstellung (z.B. x-obj.user). Sicherer, aber im Prototyping unpraktischer 
	# wär es unkritische Objekttypen zu whitelisten.
	if media_type == user.User.media_type and not "id" in query.parms:
		raise NotImplementedError( "Missing feature" ) # TODO
		c = app.db.cursor()
		c.execute( """select count(*) from privileges 
						where privilege=? and object_id=?""",
					['create_user', usr.id] )
		if( c.fetchone()!=1 ):
			raise errors.PrivilegeError()
		if "nick" in query.parms and "password" in query.parms \
		and "email" in query.parms and "fullname" in query.parms:
			usr = user.User( app = app,
								nick = query.parms["nick"], 
								plain_password = query.parms["password"],
								email = query.parms["email"], 
								fullname = query.parms["fullname"] )
			response.output = str( {"succeeded" : True,
									"object_id" : usr.id} )
		else:
			raise errors.ParameterError()
	else:
		object_id = None
		if "id" in query.parms:
			object_id = int( query.parms["id"] )
			if not usr.can_write( object_id ):
				raise errors.PrivilegeError()
		parent_id = None
		if "parent_id" in query.parms:
			parent_id = int( query.parms["parent_id"] )
		data = None
		if "data" in query.parms:
			data = query.parms["data"]
		title = None
		if "title" in query.parms:
			title = query.parms["title"]
		sequence = 0
		if "sequence" in query.parms:
			sequence = int( query.parms["sequence"] )
		obj = None
		if media_type == db_object.Text.media_type:
			obj = db_object.Text( app, usr=usr, object_id=object_id,
								  parent_id=parent_id )
		elif media_type == profile.Contact.media_type:
			obj = profile.Contact( app, usr=usr, object_id=object_id, 
									parent_id=parent_id )
		elif media_type == profile.Application.media_type:
			obj = profile.Application( app, usr=usr, object_id=object_id, 
										parent_id=parent_id )
		elif media_type == user.User.media_type and object_id:
			obj = user.User( app, user_id=object_id )
		else:
			obj = db_object.DBObject( app, usr=usr, object_id=object_id, 
									  parent_id=parent_id, 
									  media_type=media_type )
		obj.update( **dict(itertools.chain( 
						query.parms.items(),
						{"parent_id":parent_id, "data":data, "title":title, 
							"sequence":sequence}.items()
						 )) )
		response.output = str( {"succeeded" : True, 
								"object_id" : obj.id} )

