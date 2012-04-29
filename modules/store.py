import sqlite3, time, imp
from lib import user
user = imp.reload( user )

# CREATE TABLE objects (id INTEGER PRIMARY KEY, parent NUMERIC, type TEXT, read NUMERIC, write NUMERIC, priority NUMERIC, mtime NUMERIC)
# application/x-obj.user
# application/x-obj.group
# text/plain

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
		raise Exception( "You need to authenticate yourself" )
	user_id = int(session.parms["user_id"])
	if "type" in query.parms:
		media_type = query.parms["type"]
		if media_type == "text/plain":
			# CREATE TABLE text (object_id NUMERIC REFERENCES objects(id) ON UPDATE CASCADE ON DELETE CASCADE, data TEXT)
			con = sqlite3.connect( app.db_path )
			c = con.cursor()
			object_id = None
			if "id" in query.parms:
				object_id = int( query.parms["id"] )
				if not user.can_write( app, user_id, object_id ):
					raise Exception( "Insufficient privileges" )
			parent_id = None
			if "parent_id" in query.parms:
				parent_id = int( query.parms["parent_id"] )
			if parent_id or not object_id:
				if not parent_id:
					# Beiträge gehören standardmäßig zum Nutzer:
					parent_id = user_id
				if not user.can_write( app, user_id, parent_id ):
					raise Exception( "Insufficient privileges" )
			if "data" in query.parms:
				data = query.parms["data"]
				if not object_id:
					c.execute( """insert into objects (parent,type,mtime) 
									values(?,?,?)""",
								[parent_id, media_type, time.time()] )
					object_id = c.lastrowid
					c.execute( """insert into text (object_id, data)
									values(?,?)""",
								[object_id, data] )
				else:
					if parent_id:
						c.execute( """update objects set parent=?, mtime=?
										where id=?""",
									[parent_id, time.time(), object_id] )
					else:
						c.execute( """update objects set mtime=?
										where id=?""",
									[time.time(), object_id] )
					c.execute( """update text set data=?
									where object_id=?""",
								[data, object_id] )
				con.commit()
				c.close()
				response.output = str( {"succeeded" : True, 
										"object_id" : object_id} )
			else:
				raise Exception( "Missing parameters" )
		elif media_type == "application/x-obj.user":
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
					raise Exception( "Insufficient privileges" )
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
					raise Exception( "Missing parameters" )
		else:
			raise NotImplementedError( "Unsupported media type" )
