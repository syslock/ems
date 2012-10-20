import imp, os
from mako.template import Template
from lib import errors
errors = imp.reload( errors )

# media type assignments: http://www.iana.org/assignments/media-types/index.html
response_types_by_extension = {
	"html" : "text/html", # http://www.rfc-editor.org/rfc/rfc2854.txt
	"js" : "application/javascript", # http://www.rfc-editor.org/rfc/rfc4329.txt
	"css" : "text/css", # http://www.rfc-editor.org/rfc/rfc2318.txt
	"txt" : "text/plain", # http://www.rfc-editor.org/rfc/rfc5147.txt
}
default_response_type = "text/plain"

def process( app ):
	query = app.query
	response = app.response
	if not "tpl" in query.parms:
		raise errors.ParameterError( "Missing template identifier" )
	tpl = os.path.join( app.path, "templates", query.parms["tpl"] )
	if "../" in tpl or not os.stat(tpl):
		raise errors.ParameterError( "Invalid template identifier" )
	response.output = Template( filename=tpl, input_encoding="utf-8" ).render( app=app )
	tpl_ext = tpl.split(".")[-1]
	response.media_type = default_response_type
	# TODO: Kontrolle des media_types aus Template heraus zulassen
	if tpl_ext in response_types_by_extension:
		response.media_type = response_types_by_extension[tpl_ext]