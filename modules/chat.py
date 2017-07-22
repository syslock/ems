import json, threading

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
				self.dst_queues[dst.nick][None] = []
			else:
				self.dst_queues[dst.nick][dst.con] = []
	def remove_destination( self, dst ):
		if dst.nick in self.dst_queues:
			if dst.con in self.dst_queues[dst.nick] and dst.con!=None:
				del self.dst_queues[dst.nick][dst.con]
			if len(self.dst_queues[dst.nick])==0:
				del self.dst_queues[dst.nick]
	def get_connected_nicks( self ):
		nicks = set()
		for nick in self.dst_queues:
			for con in self.dst_queues[nick]:
				if con!=None:
					nicks.add( nick )
		return list(nicks)
	def send_message( self, dst, msg, msg_type="text", src=None ):
		self.register_destination( dst )
		if dst.con:
			# Direktzustellung an spezifische Verbindung
			self.dst_queues[dst.nick][dst.con].insert( 0, {"src" : src, "msg_type" : msg_type, "msg" : msg} )
		else:
			# Nachrichtenzustellung erfolgt an alle für den Nick registrierten Verbindungen
			for con in self.dst_queues[dst.nick]:
				self.dst_queues[dst.nick][con].insert( 0, {"src" : src, "msg_type" : msg_type, "msg" : msg} )
	def broadcast_message( self, msg, msg_type="text", src=None ):
		for nick in self.dst_queues:
			self.send_message( src=src, dst=Destination(nick), msg=msg, msg_type=msg_type )
	def recv_message( self, dst ):
		self.register_destination( dst )
		while self.dst_queues[dst.nick][dst.con]:
			msg = self.dst_queues[dst.nick][dst.con].pop()
			#msg["msg"] += " -> [%s,%s]" % (dst.nick,str(dst.con))
			yield msg
		
global_chat_server = ChatServer()
global_chat_server_semaphore = threading.Semaphore()

def initialize( ws_server ):
	print( str(threading.current_thread().ident)+" initialize" )
	global global_chat_server
	ws_server.user_status = ws_server.app.user.status()
	nick = ws_server.user_status["login"]["nick"]
	global_chat_server_semaphore.acquire()
	global_chat_server.register_destination( dst=Destination(nick,ws_server.con) )
	global_chat_server.broadcast_message( msg={"nick":nick, "nick_list":global_chat_server.get_connected_nicks()}, msg_type="join" )
	print( str(global_chat_server.dst_queues) )
	global_chat_server_semaphore.release()

def process_message( ws_server, msg ):
	print( str(threading.current_thread().ident)+" process_message" )
	cmd = json.loads(msg)
	global global_chat_server
	if "msg" in cmd:
		global_chat_server_semaphore.acquire()
		if "dst" in cmd:
			global_chat_server.send_message( src=ws_server.user_status["login"]["nick"], dst=Destination(cmd["dst"]), msg=cmd["msg"] )
		else:
			global_chat_server.broadcast_message( src=ws_server.user_status["login"]["nick"], msg=cmd["msg"] )
		global_chat_server_semaphore.release()

def run( ws_server ):
	#print( str(threading.current_thread().ident)+" run" )
	global global_chat_server
	global_chat_server_semaphore.acquire()
	for msg in global_chat_server.recv_message( dst=Destination(ws_server.user_status["login"]["nick"],ws_server.con) ):
		ws_server.ws.send( json.dumps(msg) )
	global_chat_server_semaphore.release()

def sleep( ws_server ):
	#print( str(threading.current_thread().ident)+" sleep" )
	ws_server.ws.client_message_event.wait( timeout=0.2 )
	
def cleanup( ws_server ):
	print( str(threading.current_thread().ident)+" cleanup" )
	global global_chat_server
	nick = ws_server.user_status["login"]["nick"]
	global_chat_server_semaphore.acquire()
	global_chat_server.remove_destination( dst=Destination(nick,ws_server.con) )
	global_chat_server.broadcast_message( msg={"nick":nick, "nick_list":global_chat_server.get_connected_nicks()}, msg_type="leave" )
	print( str(global_chat_server.dst_queues) )
	global_chat_server_semaphore.release()
