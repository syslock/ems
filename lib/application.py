import sys, random, string, re, datetime, sqlite3, time, os, imp
from urllib.parse import parse_qs
import config
config = imp.reload( config ) # DEBUG? 
# Es muss einen Weg geben die Konfiguration auf Befehl neu einzulesen...
from lib import errors
errors = imp.reload( errors ) # DEBUG?
from lib import user
user = imp.reload( user )

class Request:
	"""Implementiert Parameterübergabe an die Webanwendung"""
	def __init__( self, environ ):
		self.environ = environ
		self.remote_addr = self.environ["REMOTE_ADDR"]
		self.cookies = {}
		self.parms = {}
		self.merge_cookies()
		if "QUERY_STRING" in self.environ:
			self.merge_parms( self.environ["QUERY_STRING"] ) # Parms überschreiben Cookies
		self.content = None
		self.content_type = "CONTENT_TYPE" in self.environ and self.environ["CONTENT_TYPE"] or None
		self.content_media_type = None
		self.content_length = "CONTENT_LENGTH" in self.environ and int(self.environ["CONTENT_LENGTH"]) or 0
		if self.content_type and self.content_length:
			ct_parts = [x.split("=") for x in [x.strip() for x in self.content_type.split(";")]]
			self.content_media_type = ct_parts[0][0]
			# read and decode url-encoded form data from POST content if present:
			if self.content_media_type in ["application/x-www-form-urlencoded"]:
				self.content = self.environ["wsgi.input"].read()
				if len(ct_parts)>1 and ct_parts[1][0]=="charset":
					charset = ct_parts[1][1]
					self.content = self.content.decode( charset )
				else:
					try:
						self.content = self.content.decode("utf-8")
					except UnicodeDecodeError:
						self.content = self.content.decode("latin1")
				self.merge_parms( self.content ) # Post-Parameter überschreiben URL-Parameter
			elif self.content_media_type in ["multipart/form-data"]:
				pass # hier machen wir erst mal nichts damit, das Parsen übernehmen modules/store.py etc.
		self.xml_fix_parms() # XML-Kontrollzeichen ersetzen
		
	XML_FIXES = [
		("&",  "&amp;"), # MUSS ZUERST ERSETZT WERDEN!
		("<", "&lt;"),
		(">", "&gt;"),
	]
	def xml_fix_parm( self, parm ):
		for pair in self.XML_FIXES:
			parm = parm.replace( pair[0], pair[1] )
		return parm
	def xml_fix_parms( self ):
		"""Ersetzt empfangene XML-Kontrollzeichen mit XML-Entities"""
		new_parms = {}
		for key in self.parms:
			new_parms[ self.xml_fix_parm(key) ] = self.xml_fix_parm(self.parms[key])
		self.parms = new_parms
	
	def merge_parms( self, query_string ):
		"""Liest URL-Query-String-Parameter ein"""
		_parms = parse_qs( query_string, keep_blank_values=True )
		for key in _parms:
			self.parms[ key ] = _parms[key][0]
	
	def merge_cookies( self ):
		"""Liest Cookies ein"""
		if "HTTP_COOKIE" in self.environ:
			cookies = re.findall( '([^=; ]*)=(?:"([^"]*)"|([^;]*))', 
									self.environ["HTTP_COOKIE"] )
			for cookie in cookies:
				self.cookies[cookie[0]] = cookie[1] or cookie[2]
				self.parms[cookie[0]] = cookie[1] or cookie[2]

class Cookie:
	"""Vereinfacht serverseitiges Setzen von Cookies"""
	def __init__( self, key, value, path="/", expires=None ):
		self.key = key
		self.value = value
		self.path = path
		if not expires:
			expires = datetime.datetime.utcnow()
			expires = expires.replace( year=expires.year+1 )
		self.expires = expires
	def get_header( self ):
		"""Erzeugt einen Set-Cookie-Header im von WSGI erwarteten Tupel-Format"""
		key = self.key
		value = self.value
		path= self.path
		expires = self.expires.strftime( "%a, %d-%m-%y %H:%M:%S GMT" )
		return ( "Set-Cookie", "%(key)s=%(value)s; path=%(path)s; expires=%(expires)s;" % locals() )

class Response:
	"""Implementiert Header-Erzeugung und Ausgabekodierung"""
	def __init__( self, start_response ):
		self.status = '200 OK'
		self.output = ""
		self.media_type = "text/plain"
		self.encoding = "utf-8"
		self.start_response = start_response
		self.response_headers = []
		self.caching = False
		self.cookies = {}
		self.content_length = None
		self.buffer_size = 4096
		self.content_disposition = None
		self.last_modified = None
		self.max_age = 60*60*24*30 # 30 Tage
	def encode_chunk( self, data ):
		if type(data)==str and self.encoding:
			return data.encode( self.encoding )
		else:
			return data
	def finalize( self ):
		"""Sendet Header und liefert ggf. korrekt kodierten Ausgabestrom zurück"""
		streaming = hasattr( self.output, "read" )
		if self.encoding:
			self.response_headers.append( ('Content-Type', '%s; charset=%s' % (self.media_type,self.encoding.upper())) )
		else:
			self.response_headers.append( ('Content-Type', self.media_type) )
		if not streaming:
			encoded_output = self.encode_chunk( self.output )
			self.content_length = len(encoded_output)
		if self.content_length != None:
			self.response_headers.append( ('Content-Length',  str(self.content_length)) )
		cookie_objects = map( lambda key: Cookie(key, self.cookies[key]), self.cookies.keys() )
		for cookie in cookie_objects:
			self.response_headers.append( cookie.get_header() )
		if not self.caching:
			self.response_headers.append( ('Cache-Control', 'no-store') )
		elif self.last_modified:
			self.response_headers.append( ('Last-Modified', time.strftime("%a, %d %b %Y %H:%M:%S",time.localtime(self.last_modified))) )
			self.response_headers.append( ('Cache-Control', 'max-age='+str(self.max_age)) )
		if self.content_disposition:
			self.response_headers.append( ('Content-Disposition', self.content_disposition) )
		self.start_response( self.status, self.response_headers )
		if not streaming:
			yield encoded_output
		else:
			buffer = self.output.read( self.buffer_size )
			while len(buffer)>0:
				yield self.encode_chunk(buffer)
				buffer = self.output.read( self.buffer_size )
			self.output.close()

# CREATE TABLE session_parms (sid TEXT, key TEXT, value TEXT, mtime NUMERIC, UNIQUE (sid, key) ON CONFLICT REPLACE)
class Session:
	"""Persistente Speicherung von Session-Parametern"""
	def __init__( self, app, sid=None ):
		self.app = app
		if not sid:
			sid = "".join(random.sample(string.ascii_uppercase \
											+ string.ascii_lowercase \
											+ string.digits, 32))
		self.sid = sid
		self.parms = {}
		c = self.app.db.cursor()
		c.execute( """select key, value from session_parms
			where sid=? order by mtime""", [self.sid] )
		for row in c:
			key, value = row
			self.parms[key] = value
	def store( self ):
		c = self.app.db.cursor()
		c.execute( """delete from session_parms where sid=?""",
					[self.sid] )
		for key in self.parms:
			c.execute( """insert into session_parms (sid,key,value,mtime) 
							values (?,?,?,?)""",
						[self.sid,key,self.parms[key],time.time()] )
		self.app.db.commit()
	def get_cookies( self ):
		return { "sid" : self.sid }

class Application:
	"""Container für Anfrage- und Antwortobjekte und Pfad- und Datenbankparameter""" 
	def __init__( self, environ, start_response, name="app", path=None ):
		self.query = Request( environ )
		self.response = Response( start_response )
		self.path = path
		self.name = name
		self.db_path = os.path.join( self.path, self.name+".db" )
		self.open_db()
		self.session = Session( self, sid=("sid" in self.query.parms \
										  and self.query.parms["sid"] or None) )
		self.config = config
		self.logfile = None
		if hasattr(config,"logfile"):
			self.logfile = open( os.path.join(self.path, config.logfile), "a" )
		self.tracefile = None
		if hasattr(config,"tracefile"):
			self.tracefile = open( os.path.join(self.path, config.tracefile), "a" )
			def trace( message ):
				self.trace( message )
			self.db.set_trace_callback( trace )
			self.trace( self )
		self.access_cache = {}
		self.user = user.get_anonymous_user(self)
		if "user_id" in self.session.parms:
			self.user = user.User( self, user_id=int(self.session.parms["user_id"]) )
	def open_db( self ):
		self.db = sqlite3.connect( self.db_path )
		return self.db
	def close_db( self ):
		self.db.close()
		self.db = None
	def log( self, message ):
		if self.logfile:
			self.logfile.write( time.ctime()+": "+str(message)+"\n" )
		else:
			print( "["+self.name+"] "+message ) # Write to Server log, e.g. /var/log/htpd/error_log
	def trace( self, message ):
		if self.tracefile:
			self.tracefile.write( time.ctime()+": "+str(message)+"\n" )
