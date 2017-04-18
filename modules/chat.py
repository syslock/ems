import json

class ChatServer:
	def __init__( self ):
		self.dst_queues = {}
		self.dst_by_id = {}
	def register_destination( self, dst ):
		if dst not in self.dst_queues:
			self.dst_queues[dst] = []
	def send_message( self, src, dst, msg ):
		self.register_destination( dst )
		self.dst_queues[dst].insert( 0, {"src" : src, "msg" : msg} )
	def broadcast_message( self, src, msg ):
		for dst in self.dst_queues:
			self.send_message( src, dst, msg )
	def recv_message( self, dst ):
		self.register_destination( dst )
		while self.dst_queues[dst]:
			yield self.dst_queues[dst].pop()
		
global_chat_server = ChatServer()

def initialize( ws_server ):
	global global_chat_server
	ws_server.user_status = ws_server.app.user.status()
	global_chat_server.register_destination( ws_server.user_status["login"]["nick"] )

def process_message( ws_server, msg ):
	cmd = json.loads(msg)
	global global_chat_server
	if "msg" in cmd:
		if "dst" in cmd:
			global_chat_server.send_message( src=ws_server.user_status["login"]["nick"], dst=cmd["dst"], msg=cmd["msg"] )
		else:
			global_chat_server.broadcast_message( src=ws_server.user_status["login"]["nick"], msg=cmd["msg"] )

def run( ws_server ):
	global global_chat_server
	for msg in global_chat_server.recv_message( dst=ws_server.user_status["login"]["nick"] ):
		ws_server.ws.send( json.dumps(msg) )

def sleep( ws_server ):
	ws_server.ws.client_message_event.wait( timeout=0.2 )
