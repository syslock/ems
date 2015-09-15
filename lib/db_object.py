import time, imp, os, shutil, io, re
from lib import errors
errors = imp.reload( errors )
from lib import lexer
lexer = imp.reload( lexer )

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
			if not parent_type_set or curr_parent_type in parent_type_set or "file" in parent_type_set and File.supports(self.app, curr_parent_type):
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
			if not child_type_set or curr_child_type in child_type_set or "file" in child_type_set and File.supports(self.app, curr_child_type):
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

class File( DBObject ):
	base_type = "application/octet-stream" # https://www.rfc-editor.org/rfc/rfc2046.txt
	def __init__( self, app, **keyargs ):
		super().__init__( app, **keyargs )
		upload_path = "upload"
		if hasattr(self.app.config,"upload_path"):
			upload_path = self.app.config.upload_path
		self.storage_path = os.path.join( self.app.path, upload_path, "%d" % (self.id) )
		# Bisher unbekannte Datentypen in der Typ-Hierarchie von File speichern
		if not File.supports( self.app, self.media_type ):
			# (Ausnahmen: text/plain, text/html und application/x-obj.*; 
			#	Dies wäre an Stellen an denen File-Objekte von anderen abgegrenzt werden sollen, z.b. search, hinderlich.)
			if self.media_type not in ("text/plain","text/html") and not self.media_type.startswith("application/x-obj."):
				c = self.app.db.cursor()
				c.execute( """insert into type_hierarchy (base_type, derived_type) values(?, ?)""", [self.base_type, self.media_type] )
				self.app.db.commit()
			else:
				# Speicherung der oben ausgeklammerten, internen Datentypen als Blobs erlauben:
				self.media_type = File.base_type
				c = self.app.db.cursor()
				c.execute( """update objects set type=? where id=?""", [self.media_type, self.id] )
	@classmethod
	def supports( cls, app, file_type ):
		if file_type==cls.base_type:
			return True
		else:
			c = app.db.cursor()
			c.execute( """select base_type, derived_type from type_hierarchy where base_type=? and derived_type=?""", [cls.base_type, file_type] )
			result = c.fetchone()
			return result!=None
	def update( self, **keyargs ):
		super().update( **keyargs )
		if "data" in keyargs and keyargs["data"]!=None:
			if "chunk_start" in keyargs:
				# Chunk an die angegebene Dateiposition schreiben:
				try:
					f = open( self.storage_path, "r+b" )
				except FileNotFoundError:
					f = open( self.storage_path, "w+b" )
				f.seek( keyargs["chunk_start"] )
				buffer_size = 2**10 # Kopierpuffer begrenzen
				chunk_write_count = 0
				for offset in range( 0, keyargs["chunk_size"], buffer_size ):
					buffer = keyargs["data"].read( buffer_size )
					write_size = min( buffer_size, keyargs["chunk_size"]-chunk_write_count )
					f.write( buffer[:write_size] )
					chunk_write_count += write_size
					if write_size!=len(buffer):
						raise errors.StateError( "Found extra bytes in received file chunk: %d!=%d (%d)" % (write_size,len(buffer),chunk_write_count) )
				if f.tell()>keyargs["file_expected_size"]:
					raise errors.StateError( "Actual file size exeeded expected size" )
				if keyargs["chunk_start"]+keyargs["chunk_size"]==keyargs["file_expected_size"] \
				and f.tell()!=keyargs["file_expected_size"]:
					raise errors.StateError( "Actual file size differs from expected size after final chunk" )
				f.close()
				if chunk_write_count!=keyargs["chunk_size"]:
					raise errors.StateError( "Chunk write count differs from specified chunk size" )
			else:
				# Datei in einem Stück ins Dateisystem kopieren:
				f = open( self.storage_path, "wb" )
				shutil.copyfileobj( keyargs["data"], f )
				f.close()
	def get_size( self ):
		try:
			return os.stat( self.storage_path ).st_size
		except FileNotFoundError as e:
			return None
	def get_data( self, meta_obj=None, attachment=False, type_override=None ):
		# Caching für Dateien erlauben:
		self.app.response.caching = True
		self.app.response.last_modified = int(self.mtime)
		if( self.app.query.if_modified_since==int(self.mtime) ):
			self.app.response.status = "304 Not Modified"
			return io.StringIO()
		if type_override and type_override==self.base_type:
			# Anfrage-Override des Content-Types auf den Klassen-Basistypen, z.b. octet-stream für erzwungende Download-Dialoge, erlauben:
			self.app.response.media_type = self.base_type
		else:
			# sonst gespeicherten Objekt-Typ angeben
			self.app.response.media_type = self.media_type
		self.app.response.content_length = self.get_size()
		self.app.response.encoding = None
		if meta_obj and "title" in meta_obj:
			disposition_type = attachment and "attachment" or "inline"
			# http://www.w3.org/Protocols/rfc2616/rfc2616-sec19.html#sec19.5.1
			self.app.response.content_disposition = '%s; filename="%s"' % ( disposition_type, meta_obj["title"].replace('"','\\"') )
		result = open( self.storage_path, "rb" )
		if( self.app.query.range ):
			# http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.35
			range_set = re.findall( '^bytes=(.*)', self.app.query.range )[0]
			ranges = range_set.split(",")
			if len(ranges)==1:
				start, stop = ranges[0].split("-")
				if start:
					start = int(start)
					result.seek( start )
					full_size = self.get_size()
					stop = stop and int(stop) or full_size-1
					self.app.response.content_length = stop-start+1
					# http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.16
					self.app.response.content_range = "bytes %d-%d/%d" % (start,stop,full_size)
				else:
					stop = int(stop)
					result.seek( -stop, 2 )
					self.app.response.content_length = stop
					full_size = self.get_size()
					self.app.response.content_range = "bytes %d-%d/%d" % (full_size-stop,full_size-1,full_size)
		return result
