import imp, threading, time
from lib import websocket
websocket = imp.reload( websocket )
from lib import errors
errors = imp.reload( errors )

def process( app ):
	if websocket.WebSocket.can_handle( app.query ):
		app.response.output = websocket.WebSocket( app, endpoint=WebSocketTest(app) )
	else:
		raise errors.ParameterError( "WebSocket handshake expected" )

class WebSocketTest( threading.Thread ):
	def __init__( self, app ):
		super().__init__()
		self.app = app
		self.count = 0
		self.quitting = False
		self.last_client_msg = None
	def onmessage( self, msg ):
		self.last_client_msg = msg
	def stop( self ):
		self.quitting = True
	def run( self ):
		while not self.quitting:
			self.count += 1
			if self.count > 1:
				time.sleep(5)
			message = str( {'succeeded': False, 'error': {'message': 'Update-Test: %d' % (self.count), 'trace': [str(self.last_client_msg)]}} )
			self.websocket.send( message )
			