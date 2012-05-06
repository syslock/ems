import sys, random, string, re, datetime, sqlite3, time, os, imp
from urllib.parse import parse_qs
import config
config = imp.reload( config ) # DEBUG? 
# Es muss einen Weg geben die Konfiguration auf Befehl neu einzulesen...

class Request:
	"""Implementiert Parameterübergabe an die Webanwendung"""
	def __init__( self, environ ):
		self.environ = environ
		self.parms = {}
		self.merge_cookies()
		self.merge_parms() # Parms überschreiben Cookies
		self.xml_fix_parms() # XML-Kontrollzeichen ersetzen
		
	def xml_fix_parm( self, parm ):
		XML_FIXES = [
			("&",  "&amp;"), # MUSS ZUERST ERSETZT WERDEN!
			("<", "&lt;"),
			(">", "&gt;"),
		]
		for pair in XML_FIXES:
			parm = parm.replace( pair[0], pair[1] )
		return parm
	def xml_fix_parms( self ):
		"""Ersetzt empfangene XML-Kontrollzeichen mit XML-Entities"""
		new_parms = {}
		for key in self.parms:
			new_parms[ self.xml_fix_parm(key) ] = self.xml_fix_parm(self.parms[key])
		self.parms = new_parms
	
	def merge_parms( self ):
		"""Liest URL-Query-String-Parameter ein"""
		if "QUERY_STRING" in self.environ:
			_parms = parse_qs( self.environ["QUERY_STRING"] )
			for key in _parms:
				self.parms[ key ] = _parms[key][0]
	
	def merge_cookies( self ):
		"""Liest Cookies ein"""
		if "HTTP_COOKIE" in self.environ:
			cookies = re.findall( '([^=; ]*)=(?:"([^"]*)"|([^;]*))', 
									self.environ["HTTP_COOKIE"] )
			for cookie in cookies:
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
		self.encoded_output = b""
		self.start_response = start_response
		self.response_headers = []
		self.caching = False
		self.cookies = []
	def add_cookie( self, cookie ):
		self.cookies.append( cookie )		
	def finalize( self ):
		"""Sendet Header und liefert korrekt kodierten Ausgabestrom zurück"""
		if self.encoding:
			self.encoded_output = self.output.encode( self.encoding )
			self.response_headers.append(
				('Content-type', '%s; charset=%s' % (self.media_type,self.encoding.upper())) )
		else:
			self.response_headers.append( ('Content-type', self.media_type) )
		self.response_headers.append(
			('Content-Length', str(len(self.encoded_output))) )
		for cookie in self.cookies:
			self.response_headers.append( cookie.get_header() )
		if not self.caching:
			self.response_headers.append(
				('Cache-Control', 'no-cache') )
		self.start_response( self.status, self.response_headers )
		return [self.encoded_output,]

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
		con = sqlite3.connect( self.app.db_path )
		c = con.cursor()
		c.execute( """select key, value from session_parms
			where sid=? order by mtime""", [self.sid] )
		for row in c:
			key, value = row
			self.parms[key] = value
		c.close()
	def store( self ):
		con = sqlite3.connect( self.app.db_path )
		c = con.cursor()
		c.execute( """delete from session_parms where sid=?""",
					[self.sid] )
		for key in self.parms:
			c.execute( """insert into session_parms (sid,key,value,mtime) 
							values (?,?,?,?)""",
						[self.sid,key,self.parms[key],time.time()] )
		con.commit()
		c.close()
	def get_cookie( self ):
		return Cookie( "sid", self.sid )

class Application:
	"""Container für Anfrage- und Antwortobjekte und Pfad- und Datenbankparameter""" 
	def __init__( self, environ, start_response, name=None, path=None ):
		self.query = Request( environ )
		self.response = Response( start_response )
		self.path = path or os.path.dirname( environ["SCRIPT_FILENAME"] )
		self.name = name or ".".join( os.path.basename(environ["SCRIPT_FILENAME"]).split(".")[:-1] )
		self.db_path = os.path.join( self.path, self.name+".db" )
		self.session = Session( self, sid=("sid" in self.query.parms \
										  and self.query.parms["sid"] or None) )
		self.config = config

