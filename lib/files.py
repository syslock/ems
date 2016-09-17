import imp, os, shutil, io, re
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )

class File( db_object.DBObject ):
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
