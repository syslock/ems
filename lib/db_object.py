import time
from lib import errors
from lib import lexer

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
			self.id = c.lastrowid
			self.index( data=self.media_type, source="type", rank=1 )
			for pid in parent_id:
				c.execute( """insert into membership (parent_id, child_id, sequence)
								values(?,?,?)""",
							[pid, self.id, sequence] )
				self.parents.append( pid )
		else:
			raise errors.ParameterError( "Cannot create anonymous object without parent" )
	
	class_registry = {}
	
	@classmethod
	def register_class( cls, new_class ):
		DBObject.class_registry[ new_class.media_type ] = new_class
		
	@classmethod
	def create_typed_object( cls, app, object_id=None, parent_id=None, media_type=None, sequence=0 ):
		if media_type == None:
			if object_id != None:
				c = app.db.cursor()
				c.execute( """select type from objects where id=?""", [object_id] )
				media_type = c.fetchone()[0]
			else:
				raise errors.ParameterError( """create_typed_object needs object_id or media_type""" )
		if media_type in DBObject.class_registry:
			selected_class = DBObject.class_registry[ media_type ]
		else:
			selected_class = DBObject
		return selected_class( app=app, object_id=object_id, parent_id=parent_id, media_type=media_type, sequence=sequence )
	
	def select( self, **keyargs ):
		inclusions = {}
		exclusions = {}
		for key in keyargs:
			if key.startswith( "not_" ):
				_key = key[ key.find("_")+1 : ]
				exclusions[ _key ] = keyargs[key]
			else:
				inclusions[ key ] = keyargs[key]
		sql_cond = ""
		for name in ("inclusions", "exclusions"):
			l = locals()[name]
			if len(l):
				if name=="inclusions":
					sql_cond += " and ("
				else:
					sql_cond += " and not ("
				for i, key in enumerate(l):
					patterns = l[key]
					patterns = patterns if type(patterns)==list else [patterns]
					for j, pattern in enumerate(patterns):
						if i+j>0:
							sql_cond += " or"
						sql_cond += " %s like '%s'" % ( key, pattern.replace("'","''") )
				sql_cond += " )"
		c = self.app.db.cursor()
		stmt = """select child_id from objects inner join membership m on m.child_id=id where m.parent_id=?"""+sql_cond
		c.execute( stmt, [self.id] )
		result = []
		for row in c:
			result.append( row[0] )
		return result
	
	def flat_copy( self, new_parent_id, include=None, exclude=None ):
		new_object = DBObject.create_typed_object( app=self.app, parent_id=new_parent_id, media_type=self.media_type )
		c = self.app.db.cursor()
		c.execute( """select data from titles where object_id=?""", [self.id] )
		result = c.fetchone()
		if result and result[0]:
			new_object.update( title=result[0] )
		for child_id in self.children:
			if include!=None and child_id not in include:
				continue
			if exclude!=None and child_id in exclude:
				continue
			# silently ignore child objects the current user can not write:
			if self.app.user.can_write( child_id ):
				DBObject( self.app, object_id=child_id ).update( parent_id=new_object.id )
		return new_object
	
	def update( self, **keyargs ):
		# FIXME: should update throw an error on unhandled keyargs? overrides would have to prevent that, by filtering custom keyargs!
		if not self.app.user.can_write( self.id ):
			raise errors.PrivilegeError()
		sequence = 0
		if "sequence" in keyargs and keyargs["sequence"]!=None:
			sequence = keyargs["sequence"]
		c = self.app.db.cursor()
		media_type = None
		if "media_type" in keyargs and keyargs["media_type"]!=None:
			media_type = keyargs["media_type"]
			if media_type!=self.media_type:
				c.execute( """update objects set type=? where id=?""", [media_type, self.id] )
				self.media_type = media_type
				self.index( data=self.media_type, source="type", rank=1 )
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
		if "ctime" in keyargs and keyargs["ctime"]!=None:
			self.ctime = float( keyargs["ctime"] )
			c.execute( """update objects set ctime=?
							where id=?""",
						[self.ctime, self.id] )
		self.mtime = time.time()
		c.execute( """update objects set mtime=?
						where id=?""",
					[self.mtime, self.id] )
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
			self.index( data=title, source="title", rank=3 )
			
	def index( self, data, source=None, rank=1 ):
		c = self.app.db.cursor()
		c.execute( """delete from keywords where object_id=? and scan_source=?""", [self.id, str(source)] )
		scan_time = int( time.time() )
		words = lexer.Lexer.scan( data )
		insert_stmt_start = """insert into keywords (object_id, word, pos, rank, scan_source, scan_time) values"""
		insert_tuple_string = ""
		is_first_tuple = True
		insert_list = []
		def do_insert():
			c.execute( insert_stmt_start+insert_tuple_string, insert_list )
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
			from lib import files
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
			from lib import files
			if not child_type_set or curr_child_type in child_type_set or "file" in child_type_set and files.File.supports(self.app, curr_child_type):
				result += [child_id]
			if child_id not in cache:
				cache[ child_id ] = True
				result += self.resolve_children( child_id, cache, child_type_set )
		return result
	
	ACCESS_MASKS={ "none" : 0, "read" : 1, "write" : 2, "all" : 3 }
	def grant_read( self, object_id ):
		self.grant_access( object_id, "read" )
	def grant_write( self, object_id ):
		self.grant_access( object_id, "write" )
	def grant_access( self, object_id, access_type, update_operator="|", cleanup_zero=False ):
		if access_type in self.ACCESS_MASKS:
			access_mask = self.ACCESS_MASKS[ access_type ]
		else:
			if int(access_type) in self.ACCESS_MASKS.values():
				access_mask = int( access_type )
			else:
				raise NotImplementedError( "Unsupported access_type" )
		if update_operator not in ("&", "|"):
			raise errors.ParameterError( "Unsupported operator: %s" % (update_operator) )
		c = self.app.db.cursor()
		c.execute( """select access_mask from permissions where subject_id=? and object_id=?""", [self.id, object_id] )
		result = c.fetchone()
		if result!=None:
			old_mask = result[0]
			if update_operator=="&" and (old_mask & access_mask)==0 and cleanup_zero:
				c.execute( """delete from permissions where subject_id=? and object_id=?""" % locals(), [self.id, object_id] )
			else:
				c.execute( """update permissions set access_mask=(access_mask%(update_operator)s%(access_mask)d) where subject_id=? and object_id=?""" \
								% locals(), [self.id, object_id] )
		else:
			c.execute( """insert into permissions (subject_id, object_id, access_mask) values (?,?,%(access_mask)d)""" \
							% locals(), [self.id, object_id] )
	
	@classmethod
	def delete_in_unsafe( cls, app, object_id_list ):
		# Delete specified objects and unconnected subtrees completely
		c = app.db.cursor()
		delete_set = set( object_id_list )
		delete_set_grown = True
		while delete_set_grown:
			delete_set_grown = False
			in_list = ",".join( [str(x) for x in delete_set] )
			# select potentially larger set of childs which must be also deleted,
			# because they have no parent outside of the delete set:
			c.execute( """select m1.child_id
							from membership m1
							left join membership m2 on m1.child_id=m2.child_id and m2.parent_id not in (%(in_list)s)
							where m1.parent_id in (%(in_list)s) and m2.parent_id is null""" % locals() )
			for row in c:
				if row[0] not in delete_set:
					delete_set_grown = True
					delete_set.add( row[0] )
		c.execute( """delete from objects where id in (%(in_list)s)""" % locals() )
		c.execute( """delete from membership where child_id in (%(in_list)s) or parent_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from permissions where object_id in (%(in_list)s) or subject_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from substitutes where original_id in (%(in_list)s) or substitute_id in (%(in_list)s)""" % locals() )
		#c.execute( """delete from chess_games where game_id in (%(in_list)s) or player_id in (%(in_list)s)""" % locals() )
		# FIXME: Need an extension registry that can provide information about generic extension tables!
		# #"applications","contacts","file_transfers",
		for extension_table in ["users","groups","text","titles",
								"player_positions","keywords","image_info"]:
			c.execute( """delete from %(extension_table)s where object_id in (%(in_list)s)""" % locals() )
		return list( delete_set )
	
	@classmethod
	def delete_in( cls, app, object_id_list, parent_id=None ):
		result_delete_list = []
		if not parent_id:
			# Without a specified parent_id this method deletes the objects in object_id_list 
			# and there unconnected subtrees completely if privileged.
			for object_id in object_id_list:
				if not app.user.can_delete( object_id ):
					raise errors.PrivilegeError( "%d cannot delete %d" % (app.user.id, object_id) )
			result_delete_list = DBObject.delete_in_unsafe( app, object_id_list )
		else:
			# For a given parent_id at first only the membership between the parent and children in object_id_list is deleted...
			for object_id in object_id_list:
				if not app.user.can_write( object_id ):
					raise errors.PrivilegeError( "%d cannot write %d" % (app.user.id, object_id) )
			if not app.user.can_write( parent_id ):
				raise errors.PrivilegeError( "%d cannot write %d" % (app.user.id, parent_id) )
			in_list = ",".join( [str(x) for x in object_id_list] )
			c = app.db.cursor()
			c.execute( """delete from membership where child_id in (%(in_list)s) and parent_id=?""" % locals(), [parent_id] )
			# ... afterwards we check for zombie children left without any parent and delete unconnected subtrees completely:
			c.execute( """select id from objects o left join membership m on o.id=m.child_id where o.id in (%(in_list)s) and m.child_id is null""" % locals() )
			delete_list = []
			for row in c:
				delete_list.append( row[0] )
			result_delete_list = DBObject.delete_in_unsafe( app, delete_list )
		return result_delete_list


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
	
	def flat_copy( self, new_parent_id ):
		new_object = super().flat_copy( new_parent_id )
		c = self.app.db.cursor()
		c.execute( """select name, description from groups where object_id=?""", [self.id] )
		result = c.fetchone()
		if result:
			new_object.update( name=result[0], description=result[1] )
		return new_object
	
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
			self.index( data=keyargs[field], source="group."+field, rank=2 )
DBObject.register_class( Group )


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
	def flat_copy( self, new_parent_id ):
		new_object = super().flat_copy( new_parent_id )
		c = self.app.db.cursor()
		c.execute( """select data from text where object_id=?""", [self.id] )
		result = c.fetchone()
		if result:
			new_object.update( data=result[0] )
DBObject.register_class( Text )


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
DBObject.register_class( HTML )


class Minion( Text ):
	media_type = "application/x-obj.minion"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def get_data( self, **keyargs ):
		result = super().get_data( **keyargs )
		return result
DBObject.register_class( Minion )


# FIXME: This is broken and should either be discarded or replaced by a generic class 
#        for table based object extensions that is not restricted to user objects only.
#        (used by iswi/profile.py)
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
	
	def flat_copy( self, new_parent_id ):
		raise NotImplementedError()
	
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
#DBObject.register_class( UserAttributes )
