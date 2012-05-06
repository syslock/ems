import time, sqlite3, os, sys, imp, traceback

def myapp( environ, start_response ):
	"""Anfragebehandlung der Webanwendung"""
	script_dir = os.path.dirname( environ["SCRIPT_FILENAME"] )
	
	if script_dir not in sys.path:
		sys.path.append( script_dir )
	import webapp
	webapp = imp.reload( webapp ) # FIXME: Reload nur für Entwicklung
	from lib import errors
	errors = imp.reload( errors )
	app = webapp.Application( environ, start_response )
	query = app.query
	response = app.response
	session = app.session
	
	response.add_cookie( session.get_cookie() )
	
	if "do" in query.parms:
		mod_name = query.parms["do"]
		if "." in mod_name:
			raise Exception( "Illegaler Modulname: %(mod_name)s" % locals() )
		module = __import__( "modules."+mod_name, fromlist=[mod_name] )
		module = imp.reload( module ) # FIXME: Reload nur für Entwicklung
		module.process( app )
	else:
		raise errors.ParameterError()
	
	return response.finalize()

def application( environ, start_response ):
	"""WSGI-Einsprungpunkt mit Ausnahmebehandlung"""
	try:
		return myapp( environ, start_response )
	except Exception as e:
		start_response( "200 OK", [] )
		trace = traceback.format_exception( Exception, e, e.__traceback__ )
		return [str( {	"succeeded":False, 
						"error":{	"message":str(e), 
									"class":e.__class__.__name__, 
									"trace":trace}} ).encode("utf-8")]
		#byte_trace = []
		#for value in trace:
		#	byte_trace.append( value.encode("utf-8") )
		#return byte_trace # FIXME: DEBUG

