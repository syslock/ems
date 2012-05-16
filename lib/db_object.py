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
		c = self.app.db.cursor()
		if object_id != None:
			self.id = object_id
			c.execute( """select type from objects where id=?""", [self.id] )
			real_media_type = c.fetchone()[0]
			if media_type!=None and real_media_type!=media_type:
				raise errors.ObjectError( "Real media type differs from requested" )
			self.media_type = real_media_type
			c.execute( """select parent_id from membership where child_id=?""", 
						[self.id] )
			self.parents = []
			for row in c:
				self.parents.append( row[0] )
			c.execute( """select child_id from membership where parent_id=?""", 
						[self.id] )
			self.children = []
			for row in c:
				self.children.append( row[0] )
		else:
			if not media_type:
				raise errors.ParameterError( "Missing media type" )
			self.media_type = media_type
			c.execute( """insert into objects (type,sequence,mtime) 
							values(?,?,?)""",
						[self.media_type, sequence, time.time()] )
			self.id = c.lastrowid
			if parent_id != None:
				c.execute( """insert into membership (parent_id, child_id)
								values(?,?)""",
							[parent_id, self.id] )
				self.children = []
				self.parents = [ parent_id ]
			self.app.db.commit()
	def update( self, sequence=0, title=None, data=None, parent_id=None, 
				media_type=None ):
		if parent_id!=None and parent_id not in self.parents:
			raise NotImplementedError( "TODO: Objektbaum umstrukturieren" )
		if media_type!=None and media_type!=self.media_type:
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
		self.app.db.commit()

class Text( DBObject ):
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = "text/plain"
		super().__init__( app, **keyargs )
	def update( self, **keyargs ):
		super().update( **keyargs )
		if "data" in keyargs:
			c = self.app.db.cursor()
			c.execute( """select object_id from text where object_id=?""",
						[self.id] )
			if not c.fetchone():
				c.execute( """insert into text (object_id, data) values(?,?)""",
							[self.id, keyargs["data"]] )
			else:
				c.execute( """update text set data=?
								where object_id=?""",
							[keyargs["data"], self.id] )
			self.app.db.commit()

