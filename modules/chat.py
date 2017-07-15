import json

class Destination:
	def __init__( self, nick, con=None ):
		self.nick = nick
		self.con = con

class ChatServer:
	def __init__( self ):
		self.dst_queues = {}
		self.dst_by_id = {}
	def register_destination( self, dst ):
		if dst.nick not in self.dst_queues:
			self.dst_queues[dst.nick] = {}
		if dst.con not in self.dst_queues[dst.nick]:
			if dst.con!=None and None in self.dst_queues[dst.nick]:
				# aufgelaufene nicht verbindungsorientierte Nachrichten übernehmen
				self.dst_queues[dst.nick][dst.con] = [] + self.dst_queues[dst.nick][None]
				# anonyme Warteschlange wird nach der Übernahme bereinigt:
				self.dst_queues[dst.nikc][None] = []
			else:
				self.dst_queues[dst.nick][dst.con] = []
	def send_message( self, src, dst, msg ):
		self.register_destination( dst )
		if dst.con:
			# Direktzustellung an spezifische Verbindung
			self.dst_queues[dst.nick][dst.con].insert( 0, {"src" : src, "msg" : msg} )
		else:
			# Nachrichtenzustellung erfolgt an alle für den Nick registrierten Verbindungen
			for con in self.dst_queues[dst.nick]:
				self.dst_queues[dst.nick][con].insert( 0, {"src" : src, "msg" : msg} )
	def broadcast_message( self, src, msg ):
		for nick in self.dst_queues:
			self.send_message( src, Destination(nick), msg )
	def recv_message( self, dst ):
		self.register_destination( dst )
		while self.dst_queues[dst.nick][dst.con]:
			msg = self.dst_queues[dst.nick][dst.con].pop()
			#msg["msg"] += " -> [%s,%s]" % (dst.nick,str(dst.con))
			yield msg
		
global_chat_server = ChatServer()

def initialize( ws_server ):
	global global_chat_server
	ws_server.user_status = ws_server.app.user.status()
	global_chat_server.register_destination( dst=Destination(ws_server.user_status["login"]["nick"],ws_server.con) )

def process_message( ws_server, msg ):
	cmd = json.loads(msg)
	global global_chat_server
	if "msg" in cmd:
		if "dst" in cmd:
			global_chat_server.send_message( src=ws_server.user_status["login"]["nick"], dst=Destination(cmd["dst"]), msg=cmd["msg"] )
		else:
			global_chat_server.broadcast_message( src=ws_server.user_status["login"]["nick"], msg=cmd["msg"] )

def run( ws_server ):
	global global_chat_server
	for msg in global_chat_server.recv_message( dst=Destination(ws_server.user_status["login"]["nick"],ws_server.con) ):
		ws_server.ws.send( json.dumps(msg) )

def sleep( ws_server ):
	ws_server.ws.client_message_event.wait( timeout=0.2 )
