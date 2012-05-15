import time, imp
from lib import errors
errors = imp.reload( errors )

class DBObject:
	def __init__( self, app, usr=None, object_id=None, parent_id=None, 
					media_type=None, sequence=0 ):
		self.app = app
		if parent_id!=None or object_id==None:
			if usr and parent_id==None:
				# Beiträge gehören standardmäßig zum Nutzer:
				parent_id = usr.id
		if parent_id!=None and usr and not usr.can_write( parent_id ):
			raise errors.PrivilegeError()
		if object_id != None:
			self.id = object_id
		else:
			if not media_type:
				raise errors.ParameterError( "Missing media type" )
			c = self.app.db.cursor()
			c.execute( """insert into objects (type,sequence,mtime) 
							values(?,?,?)""",
						[media_type, sequence, time.time()] )
			self.id = c.lastrowid
			if parent_id != None:
				c.execute( """insert into membership (parent_id, child_id)
								values(?,?)""",
							[parent_id, object_id] )
			self.app.db.commit()
	def update( self, sequence=0, title=None, data=None, parent_id=None, 
				media_type=None ):
		if parent_id:
			raise NotImplementedError( "TODO: Objektreferenzen ändern" )
		if media_type:
			raise NotImplementedError( "Cannot change media type" )
		c = self.app.db.cursor()
		c.execute( """update objects set sequence=?, mtime=?
						where id=?""",
					[sequence, time.time(), self.id] )
		if title:
			# Jedes Objekt darf einen Titel haben
			c.execute( """select object_id from titles where object_id=?""",
						[self.id] )
			if c.fetchone():
				c.execute( """update titles set data=? where object_id=?""",
							[title, self.id] )
			else:
				c.execute( """insert into titles (object_id, data) values(?,?)""",
							[self.id, title] )
		if data:
			c.execute( """select type from objects where id=?""", [self.id] )
			result = c.fetchone()
			media_type = result[0]
			if media_type == "text/plain":
				c.execute( """update text set data=?
								where object_id=?""",
							[data, object_id] )
			else:
				raise NotImplementedError( "Unsupported media type for update" )
		self.app.db.commit()

class Text( DBObject ):
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = "text/plain"
		super().__init__( app, **keyargs )
		if object_id == None:
			# neu erstellt...
			if data == None:
				data = ""
			c = self.app.db.cursor()
			c.execute( """insert into text (object_id, data) values(?,?)""",
						[self.id, data] )
			self.app.db.commit()

