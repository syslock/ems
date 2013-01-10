import time, os, sys, imp, traceback, gettext

def myapp( environ, start_response ):
	"""Anfragebehandlung der Webanwendung"""
	try:
		script_dir = environ["EMS_PATH"]
	except KeyError:
		script_dir = os.path.dirname( environ["SCRIPT_FILENAME"] )
	if script_dir[-1]=="/":
		script_dir = script_dir[:-1]
	
	if script_dir not in sys.path:
		sys.path.append( script_dir )
	from lib import application
	application = imp.reload( application ) # FIXME: Reload nur für Entwicklung
	from lib import errors
	errors = imp.reload( errors )
	app = application.Application( environ, start_response, name="ems", path=script_dir )
	query = app.query
	response = app.response
	session = app.session
	
	if( "lang" in query.parms ):
		lang = query.parms["lang"]
	else:
		lang = "en"
	if not 'FileNotFoundError' in dir(__builtins__):
		FileNotFoundError = IOError # pre Python-3.3 Fix
	try:
		translation = gettext.translation( "ems", localedir=os.path.join(script_dir,"locale"), languages=[lang], codeset="utf-8" )
		translation.install()
	except FileNotFoundError:
		gettext.install( "ems", localedir=os.path.join(script_dir,"locale"), codeset="utf-8" )
	
	# Session-Cookies aktualisieren:
	response.cookies.update( session.get_cookies() )
	
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
	"""WSGI-Einsprungpunkt mit Ausnahmebehandlung und optionaler CLI-Debugging-Unterstützung"""
	pdb = ("EMS_DEBUG" in environ and environ["EMS_DEBUG"]=="pdb")
	if pdb:
		import pdb,sys
		debugger = pdb.Pdb()
		debugger.use_rawinput = 0
		debugger.reset()
		sys.settrace( debugger.trace_dispatch )
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
	finally:
		if pdb:
			debugger.quitting = 1
			sys.settrace( None )
