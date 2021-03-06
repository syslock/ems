import threading, time
from lib import websocket
from lib import errors
from lib import user
from modules import get as get_module

def process( app ):
	if websocket.WebSocket.can_handle( app.query ):
		app.response.output = websocket.WebSocket( app, endpoint=EventMonitor(app) )
	else:
		raise errors.ParameterError( "WebSocket handshake expected" )

class EventMonitor( threading.Thread ):
	def __init__( self, app ):
		super().__init__()
		self.app = app
		self.quitting = False
		self.last_client_msg = None
	def onmessage( self, msg ):
		self.last_client_msg = msg
	def stop( self ):
		self.quitting = True
	def run( self ):
		self.app.open_db() # App-DB für diesen Thread neu öffnen...
		while not self.quitting:
			objs = get_module.get( self.app, limit=10 )
			message = str( {'succeeded': True, 'objects': objs} )
			self.websocket.send( message )
			time.sleep(30)
		self.app.close_db( commit=True ) # also commits pending changes
			
