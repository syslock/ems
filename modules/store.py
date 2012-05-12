import sqlite3, time, imp
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )

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
	if not "user_id" in session.parms:
		raise errors.AuthenticationNeeded()
	user_id = int(session.parms["user_id"])
	media_type = None
	if "type" in query.parms:
		media_type = query.parms["type"]
	if media_type == "application/x-obj.user":
		if "id" in query.parms:
			raise NotImplementedError( "Missing feature" ) # TODO
		else:
			con = sqlite3.connect( app.db_path )
			c = con.cursor()
			c.execute( """select count(*) from privileges 
							where privilege=? and object_id=?""",
						['create_user', user_id] )
			if( c.fetchone()!=1 ):
				c.close()
				raise errors.PrivilegeError()
			c.close()
			if "nick" in query.parms and "password" in query.parms \
			and "email" in query.parms and "fullname" in query.parms:
				object_id = user.create( 
								app=app,
								nick=query.parms["nick"], 
								plain_password=query.parms["password"],
								email=query.parms["email"], 
								fullname=query.parms["fullname"] )
				response.output = str( {"succeeded" : True,
										"object_id" : object_id} )
			else:
				raise errors.ParameterError()
	else:
		con = sqlite3.connect( app.db_path )
		c = con.cursor()
		object_id = None
		if "id" in query.parms:
			object_id = int( query.parms["id"] )
			if not user.can_write( app, user_id, object_id ):
				raise errors.PrivilegeError()
		parent_id = None
		if "parent_id" in query.parms:
			parent_id = int( query.parms["parent_id"] )
		if parent_id or not object_id:
			if not parent_id:
				# Beiträge gehören standardmäßig zum Nutzer:
				parent_id = user_id
			if not user.can_write( app, user_id, parent_id ):
				raise errors.PrivilegeError()
		data = None
		if "data" in query.parms:
			data = query.parms["data"]
		title = None
		if "title" in query.parms:
			title = query.parms["title"]
		sequence = 0
		if "sequence" in query.parms:
			sequence = int( query.parms["sequence"] )
		if not object_id:
			if not media_type:
				raise errors.ParameterError( "Missing media type" )
			c.execute( """insert into objects (type,sequence,mtime) 
							values(?,?,?)""",
						[media_type, sequence, time.time()] )
			object_id = c.lastrowid
			c.execute( """insert into membership (parent_id, child_id)
							values(?,?)""",
						[parent_id, object_id] )
			if title:
				c.execute( """insert into titles (object_id, data) values(?,?)""",
							[object_id, title] )
			if media_type == "text/plain":
				if data == None:
					data = ""
				c.execute( """insert into text (object_id, data) values(?,?)""",
							[object_id, data] )
		else:
			if parent_id:
				raise NotImplementedError( "TODO: Objektreferenzen ändern" )
			if media_type:
				raise NotImplementedError( "Cannot change media type" )
			c.execute( """update objects set sequence=?, mtime=?
							where id=?""",
						[sequence, time.time(), object_id] )
			if title:
				c.execute( """select object_id from titles where object_id=?""",
							[object_id] )
				if c.fetchone():
					c.execute( """update titles set data=? where object_id=?""",
								[title, object_id] )
				else:
					c.execute( """insert into titles (object_id, data) values(?,?)""",
								[object_id, title] )
			if data:
				c.execute( """select type from objects where id=?""", [object_id] )
				result = c.fetchone()
				media_type = result[0]
				if media_type == "text/plain":
					c.execute( """update text set data=?
									where object_id=?""",
								[data, object_id] )
				else:
					raise NotImplementedError( "Unsupported media type for update" )
		con.commit()
		c.close()
		response.output = str( {"succeeded" : True, 
								"object_id" : object_id} )

