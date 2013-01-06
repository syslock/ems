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
		self.parents = []
		self.children = []
		if object_id != None:
			self.id = object_id
			c.execute( """select type from objects where id=?""", [self.id] )
			real_media_type = c.fetchone()[0]
			if media_type!=None and real_media_type!=media_type:
				raise errors.ObjectError( "Real media type differs from requested" )
			self.media_type = real_media_type
			c.execute( """select parent_id from membership where child_id=?""", 
						[self.id] )
			for row in c:
				self.parents.append( row[0] )
			c.execute( """select child_id from membership where parent_id=?""", 
						[self.id] )
			for row in c:
				self.children.append( row[0] )
		else:
			if not media_type:
				raise errors.ParameterError( "Missing media type" )
			self.media_type = media_type
			c.execute( """insert into objects (type,sequence,ctime,mtime) 
							values(?,?,?,?)""",
						[self.media_type, sequence, time.time(), time.time()] )
			self.id = c.lastrowid
			if parent_id == None:
				# Objekte ohne explizites Elternobjekt werden dem Wurzelobjekt untergeordnet:
				root = get_root_object( self.app )
				if root:
					parent_id = root.id
			if parent_id != None:
				c.execute( """insert into membership (parent_id, child_id)
								values(?,?)""",
							[parent_id, self.id] )
				self.parents = [ parent_id ]
			self.app.db.commit()
	
	def update( self, **keyargs ):
		sequence = 0
		if "sequence" in keyargs:
			sequence = keyargs["sequence"]
		parent_id = None
		if "parent_id" in keyargs:
			parent_id = keyargs["parent_id"]
		if parent_id!=None and parent_id not in self.parents:
			raise NotImplementedError( "TODO: Objektbaum umstrukturieren" )
		media_type = None
		if "media_type" in keyargs:
			media_type = keyargs["media_type"]
		if media_type!=None and media_type!=self.media_type:
			raise NotImplementedError( "Cannot change media type" )
		c = self.app.db.cursor()
		c.execute( """update objects set sequence=?, mtime=?
						where id=?""",
					[sequence, time.time(), self.id] )
		if "title" in keyargs:
			title = keyargs["title"]
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
	
	def resolve_parents( self, child_id=None ):
		result = []
		child_id = child_id or self.id
		c = self.app.db.cursor()
		c.execute( """select parent_id from membership where child_id=?""", [child_id] )
		for row in c:
			parent_id = row[0]
			result += [parent_id] + self.resolve_parents( parent_id )
		return result
	
	def resolve_children( self, parent_id=None ):
		result = []
		parent_id = parent_id or self.id
		c = self.app.db.cursor()
		c.execute( """select child_id from membership where parent_id=?""", [parent_id] )
		for row in c:
			child_id = row[0]
			result += [child_id] + self.resolve_children( child_id )
		return result


def get_root_object( app ):
	c = app.db.cursor()
	c.execute( "select object_id from groups where name='root'" )
	result = c.fetchone()
	if result:
		return Group( app, object_id=result[0] )
	else:
		return None


class Group( DBObject ):
	media_type = "application/x-obj.group"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def update( self, **keyargs ):
		super().update( **keyargs )
		update_fields = []
		if "name" in keyargs:
			update_fields.append( "name" )
		if "description" in keyargs:
			update_fields.append( "description" )
		for field in update_fields:
			c = self.app.db.cursor()
			c.execute( """select object_id from groups where object_id=?""",
						[self.id] )
			if not c.fetchone():
				c.execute( """insert into groups (object_id, %(field)s) values(?,?)""" \
							% locals(), [self.id, keyargs[field]] )
			else:
				c.execute( """update groups set %(field)s=?
								where object_id=?""",
							[keyargs[field], self.id] )
			self.app.db.commit()


class Text( DBObject ):
	media_type = "text/plain"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
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


class UserAttributes( DBObject ):
	"""Abstrakte Basisklasse, für nutzerspezifische Zusatzattribute, wie z.b.
		Profildaten etc.; Implementierungen benötigen die Klassenattribute
		table, media_type und valid_fields"""
	def __init__( self, app, **keyargs ):
		if "usr" not in keyargs:
			raise errors.ObjectError( str(type(self))+" ctor needs argument usr of class User" )
		self.user = keyargs["usr"]
		c = app.db.cursor()
		c.execute( """select object_id from """+self.table+""" where user_id=?""",
					[self.user.id] )
		result = c.fetchone()
		if result:
			keyargs["object_id"] = result[0]
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
		if not result:
			c.execute( """insert into """+self.table+""" (object_id, user_id) 
							values(?,?)""", [self.id, self.user.id] )
		app.db.commit()
	def update( self, **keyargs ):
		super().update( **keyargs )
		update_fields = []
		update_values = []
		for key, value in keyargs.items():
			if key in self.valid_fields:
				update_fields.append( key )
				update_values.append( value )
		if update_fields:
			stmt = "update "+self.table+" set "+update_fields[0]+"=?"
			for field in update_fields[1:]:
				stmt += ", "+field+"=?"
			stmt += " where object_id=?"
			update_values.append( self.id )
			c = self.app.db.cursor()
			c.execute( stmt, update_values )
			self.app.db.commit()
	def get( self, query, obj ):
		requested_fields = []
		valid_fields = ["user_id"] + list(self.valid_fields)
		for key in valid_fields:
			if key in query.parms:
				requested_fields.append( key )
		if not requested_fields:
			requested_fields = valid_fields
		select_list = ", ".join( requested_fields )
		c = self.app.db.cursor()
		c.execute( """select """+select_list+""" from """+self.table+""" where object_id=?""",
			[obj["id"]] )
		result = c.fetchone()
		if not result:
			raise errors.ObjectError( "Missing object data" )
		for i in range(len(result)):
			obj[ requested_fields[i] ] = result[i]
		return obj

