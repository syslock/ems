import time, imp
from lib import errors
errors = imp.reload( errors )
from lib import lexer
lexer = imp.reload( lexer )
from lib import files
#files = imp.reload( files )

class DBObject:
	def __init__( self, app, object_id=None, parent_id=None, 
					media_type=None, sequence=0 ):
		self.app = app
		self.app.trace( self )
		if parent_id==None and object_id==None:
			# Neue Objekte gehören standardmäßig zum Nutzer:
			parent_id = app.user.id
		self.post_init( object_id, parent_id, media_type, sequence )
	def post_init( self, object_id, parent_id, media_type, sequence ):
		c = self.app.db.cursor()
		self.parents = []
		self.children = []
		if object_id != None:
			self.id = object_id
			c.execute( """select type, ctime, mtime from objects where id=?""", [self.id] )
			real_media_type, self.ctime, self.mtime = c.fetchone()
			if media_type!=None and real_media_type!=media_type:
				raise errors.ObjectError( "Real media type differs from requested" )
			self.media_type = real_media_type
			c.execute( """select parent_id from membership where child_id=? -- DBObject""", 
						[self.id] )
			for row in c:
				self.parents.append( row[0] )
			c.execute( """select child_id from membership where parent_id=?""", 
						[self.id] )
			for row in c:
				self.children.append( row[0] )
		elif parent_id:
			parent_id = isinstance(parent_id,list) and parent_id or [parent_id]
			for pid in parent_id:
				if not self.app.user.can_write( pid ):
					raise errors.PrivilegeError( "Cannot create object with parent %d: forbidden" % pid )
			if not media_type:
				raise errors.ParameterError( "Missing media type" )
			self.media_type = media_type
			self.ctime = self.mtime = time.time()
			c.execute( """insert into objects (type,ctime,mtime) 
							values(?,?,?)""",
						[self.media_type, self.ctime, self.mtime] )
			self.app.db.commit()
			self.id = c.lastrowid
			self.index( data=self.media_type, source="type", rank=1 )
			for pid in parent_id:
				c.execute( """insert into membership (parent_id, child_id, sequence)
								values(?,?,?)""",
							[pid, self.id, sequence] )
				self.app.db.commit()
				self.parents.append( pid )
		else:
			raise errors.ParameterError( "Cannot create anonymous object without parent" )
	
	def update( self, **keyargs ):
		if not self.app.user.can_write( self.id ):
			raise errors.PrivilegeError()
		sequence = 0
		if "sequence" in keyargs and keyargs["sequence"]!=None:
			sequence = keyargs["sequence"]
		media_type = None
		if "media_type" in keyargs and keyargs["media_type"]!=None:
			media_type = keyargs["media_type"]
			if media_type!=self.media_type:
				raise NotImplementedError( "Cannot change media type" )
		c = self.app.db.cursor()
		parent_id = None
		if "parent_id" in keyargs and keyargs["parent_id"]!=None:
			parent_id = keyargs["parent_id"]
			if parent_id:
				parent_id = isinstance(parent_id,list) and parent_id or [parent_id]
				for pid in parent_id:
					if not self.app.user.can_write(pid):
						raise errors.PrivilegeError( "Membership change requires write access to parent object" )
				for pid in parent_id:
					if pid not in self.parents:
						c.execute( """insert into membership (parent_id, child_id, sequence)
										values(?,?,?)""",
									[pid, self.id, sequence] )
						self.parents.append( pid )
					else:
						c.execute( """update membership set sequence=?
										where parent_id=? and child_id=?""",
									[sequence, pid, self.id] )
					self.app.db.commit()
		c.execute( """update objects set mtime=?
						where id=?""",
					[time.time(), self.id] )
		self.app.db.commit()
		if "title" in keyargs and keyargs["title"]!=None:
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
			self.index( data=title, source="title", rank=3 )
			
	def index( self, data, source=None, rank=1 ):
		c = self.app.db.cursor()
		c.execute( """delete from keywords where object_id=? and scan_source=?""", [self.id, str(source)] )
		self.app.db.commit()
		scan_time = int( time.time() )
		words = lexer.Lexer.scan( data )
		insert_stmt_start = """insert into keywords (object_id, word, pos, rank, scan_source, scan_time) values"""
		insert_tuple_string = ""
		is_first_tuple = True
		insert_list = []
		def do_insert():
			c.execute( insert_stmt_start+insert_tuple_string, insert_list )
			self.app.db.commit()
		for pos, word in words:
			value_tuple = [self.id, word, pos, rank, str(source), scan_time]
			if len(insert_list)>(999-len(value_tuple)):
				do_insert()
				insert_tuple_string = ""
				is_first_tuple = True
				insert_list = []
			insert_tuple_string += "\n\t"
			if not is_first_tuple:
				insert_tuple_string += ","
			is_first_tuple = False
			insert_tuple_string += "(?,?,?,?,?,?)"
			insert_list += value_tuple
		if insert_list:
			do_insert()
	
	def closest_parents( self, child_ids=None, parent_type=None ):
		result = set()
		if child_ids==None:
			child_ids = {self.id}
		parent_condition = "child_id in %s" % str(tuple(child_ids)).replace(",)",")")
		if parent_type:
			parent_condition += " and p.type='%s'" % (parent_type.replace("'","''"))
		c = self.app.db.cursor()
		c.execute( """select distinct parent_id from membership
						inner join objects p on p.id=parent_id
						where %s -- closest_parents""" % (parent_condition) )
		for row in c:
			parent_id = row[0]
			result.add( parent_id )
		return result
	
	def resolve_parents( self, child_id=None, cache=None, parent_type_set=None ):
		# Komplexe Datentypen hier initialisieren, um global state singletons aus der Signatur zu vermeiden
		if cache==None:
			cache = {}
		if parent_type_set==None:
			parent_type_set = set()
		result = []
		child_id = child_id or self.id
		c = self.app.db.cursor()
		c.execute( """select parent_id, p.type from membership 
						inner join objects p on p.id=parent_id
						where child_id=? -- resolve_parents""", [child_id] )
		for row in c:
			parent_id = row[0]
			curr_parent_type = row[1]
			if not parent_type_set or curr_parent_type in parent_type_set or "file" in parent_type_set and files.File.supports(self.app, curr_parent_type):
				result += [parent_id]
			if parent_id not in cache:
				cache[ parent_id ] = True
				result += self.resolve_parents( parent_id, cache, parent_type_set )
		return result
	
	def resolve_children( self, parent_id=None, cache=None, child_type_set=None ):
		# Komplexe Datentypen hier initialisieren, um global state singletons aus der Signatur zu vermeiden
		if cache==None:
			cache = {}
		if child_type_set==None:
			child_type_set = set()
		result = []
		parent_id = parent_id or self.id
		c = self.app.db.cursor()
		c.execute( """select child_id, c.type from membership 
						inner join objects c on c.id=child_id
						where parent_id=? -- resolve_children""", [parent_id] )
		for row in c:
			child_id = row[0]
			curr_child_type = row[1]
			if not child_type_set or curr_child_type in child_type_set or "file" in child_type_set and files.File.supports(self.app, curr_child_type):
				result += [child_id]
			if child_id not in cache:
				cache[ child_id ] = True
				result += self.resolve_children( child_id, cache, child_type_set )
		return result
	
	ACCESS_MASKS={ "read" : 1, "write" : 2 }
	def grant_read( self, object_id ):
		self.grant_access( object_id, "read" )
	def grant_write( self, object_id ):
		self.grant_access( object_id, "write" )
	def grant_access( self, object_id, access_type ):
		if access_type not in ("read", "write"):
			raise NotImplementedError( "Unsupported access_type" )
		access_mask = self.ACCESS_MASKS[ access_type ]
		c = self.app.db.cursor()
		c.execute( """select * from permissions where subject_id=? and object_id=?""", [self.id, object_id] )
		if c.fetchone()!=None:
			c.execute( """update permissions set access_mask=(access_mask|%(access_mask)d) where subject_id=? and object_id=?""" \
							% locals(), [self.id, object_id] )
			self.app.db.commit()
		else:
			c.execute( """insert into permissions (subject_id, object_id, access_mask) values (?,?,%(access_mask)d)""" \
							% locals(), [self.id, object_id] )
			self.app.db.commit()


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
		if "name" in keyargs and keyargs["name"]!=None:
			update_fields.append( "name" )
		if "description" in keyargs and keyargs["description"]!=None:
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
			self.index( data=keyargs[field], source="group."+field, rank=2 )


class Text( DBObject ):
	media_type = "text/plain"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def update( self, **keyargs ):
		super().update( **keyargs )
		if "data" in keyargs and keyargs["data"]!=None:
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
			self.index( data=keyargs["data"], source="text", rank=2 )
	def get_data( self ):
		c = self.app.db.cursor()
		c.execute( """select data from text where object_id=?""", 
			[self.id] )
		result = c.fetchone()
		data = None
		if result:
			data = result[0]
		data = data or "" # Nicht None zurück geben, um andere Programmteile nicht zu verwirren...
		return data


class HTML( Text ):
	media_type = "text/html"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def get_data( self, **keyargs ):
		result = super().get_data( **keyargs )
		# Zum Schutz gegen XSS-Angriffe XML-quotiert application.Request 
		# URL-kodierten Parameter. Daher ist unser Datenbankinhalt 
		# grundsätzlich XML-quotiert und wir müssen für unsere 
		# HTML-Daten hier eine explizite Rücktransformation vornehmen:
		for pair in reversed(self.app.query.XML_FIXES):
			result = result.replace( pair[1], pair[0] )
		return result


class Minion( Text ):
	media_type = "application/x-obj.minion"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def get_data( self, **keyargs ):
		result = super().get_data( **keyargs )
		return result


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
			# FIXME: security issue? UserAttributes are as public as the User itself is...
			for i in range(len(update_fields)):
				self.index( data=update_values[i], source="user."+update_fields[i], rank=2 )
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
