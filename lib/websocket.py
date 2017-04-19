import socket, os, sys, base64, hashlib, imp, struct, time, signal, threading, traceback
from lib import errors
errors = imp.reload( errors )
from lib import application
application = imp.reload( application )

class WSListener():
	def __init__( self, address="0.0.0.0", port=8888 ):
		self.address = address
		self.port = port
	def listen( self ):
		s = socket.socket()
		s.bind( (self.address, self.port) )
		s.listen( 0 )
		try:
			while True:
				con, addr = s.accept()
				try:
					ws_server = WSServer( con, addr )
				except Exception as e:
					sys.stderr.write( "\n".join(traceback.format_exception(Exception, e, e.__traceback__)) )
					continue
				ws_server.start()
		except:
			s.close()
			raise

class WSServer( threading.Thread ):
	def __init__( self, con, addr ):
		self.con = con
		self.addr = addr
		self.quitting = False
		environ = {}
		environ["REMOTE_ADDR"] = self.addr[0]
		print( "Connection from %s" % (environ["REMOTE_ADDR"]) )
		b = self.con.recv(1)
		headlines = []
		ch = b""
		while b:
			ch += b
			if( ch[-2:]==b"\r\n" ):
				if( len(ch)>2 ):
					headlines.append( ch[:-2].decode("utf-8") )
					ch = b""
				else:
					break
			b = con.recv(1)
		self.method, self.uri, self.protocol = headlines[0].split()
		print( "%s %s %s" % (self.method, self.uri, self.protocol) )
		try:
			environ["QUERY_STRING"] = self.uri[self.uri.index("?")+1:]
		except ValueError:
			environ["QUERY_STRING"] = ""
		for hl in headlines[1:]:
			print( hl )
			key, val = hl.split(": ")
			environ["HTTP_"+key.upper().replace("-","_")] = val
		self.app = application.Application( environ, lambda x,y: None, name="ems", path=os.path.dirname(sys.argv[0]) )
		print( self.app.query.parms )
		if "do" in self.app.query.parms:
			mod_name = self.app.query.parms["do"]
			if "." in mod_name:
				raise Exception( "Illegaler Modulname: %(mod_name)s" % locals() )
			self.module = __import__( "modules."+mod_name, fromlist=[mod_name] )
			self.module = imp.reload( self.module ) # FIXME: Reload nur für Entwicklung
		else:
			raise errors.ParameterError()
		self.ws = WebSocket( self.app, self.con, self )
		self.ws.send_handshake()
		super().__init__()
	def onmessage( self, msg ):
		try:
			self.module.process_message( self, msg )
		except:
			return
	def stop( self ):
		self.con.close()
		self.quitting = True
	def run( self ):
		def read_thread():
			while not self.quitting:
				data = self.ws.communicate()
				if data:
					self.con.send( data )
				else:
					self.module.sleep( self )
				if self.ws.quitting:
					print( "WebSocket-Shutdown (%s)" % (self.app.query.remote_addr) )
					print( "WebSocket-Shutdown (%s)" % (self.app.query.remote_addr) )
					self.stop()
		t = threading.Thread( target=read_thread )
		t.start()
		self.app.open_db() # App-DB für diesen Thread neu öffnen...
		self.module.initialize( self )
		while not self.quitting:
			self.module.run( self )
			self.module.sleep( self )
		t.join()

class WebSocket:
	def __init__( self, app, socket, endpoint=None ):
		if not self.can_handle( app.query ):
			raise errors.ParameterError( "HTTP Request does not seem to be a WebSocket handshake initiation" )
		if endpoint and not isinstance( endpoint, threading.Thread ):
			raise errors.InternalProgramError( "WebSocket endpoint needs to be an instance of Thread" )
		if endpoint and not hasattr( endpoint, "stop" ):
			print( "Warning: WebSocket endpoint %s should implement stop()" % str(endpoint) )
		self.app = app
		if endpoint:
			endpoint.websocket = self
		self.endpoint = endpoint
		if hasattr(endpoint,"onmessage"):
			self.onmessage = endpoint.onmessage
		else:
			self.onmessage = lambda x: None
		self.last_msg_received = 0 # seconds (float)
		self.keep_alive_timeout = 5*60 # seconds
		self.roundtrip_times = [] # ms (list of ints)
		self.prepare_handshake()
		#self.input = app.query.environ["wsgi.input"]
		self.socket = socket
		self.client_messages = []
		self.client_messages_semaphore = threading.Semaphore()
		self.client_message_event = threading.Event()
		self.server_data = b""
		self.server_data_semaphore = threading.Semaphore()
		self.quitting = False
		self.client_reader = threading.Thread( target=self.read_frames_from_client )
		self.client_reader.start()
	
	def prepare_handshake( self ):
		response = self.app.response
		query = self.app.query
		ws_key = query.environ["HTTP_SEC_WEBSOCKET_KEY"]
		# https://tools.ietf.org/html/rfc6455
		ws_guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
		ws_accept = base64.b64encode( hashlib.sha1( (ws_key+ws_guid).encode("utf-8") ).digest() ).decode("utf-8")
		response.response_headers.append( ('Upgrade', 'websocket') )
		response.response_headers.append( ('Connection', 'Upgrade') )
		response.response_headers.append( ('Sec-WebSocket-Accept', ws_accept) )
		response.status = '101 Switching Protocols'
	
	def send_handshake( self ):
		response = self.app.response
		self.socket.send( ("HTTP/1.1 "+response.status+"\r\n").encode("utf-8") )
		for h in response.response_headers:
			self.socket.send( (": ".join(h)+"\r\n").encode("utf-8") )
		self.socket.send( b"\r\n" )
	
	@classmethod
	def can_handle( cls, query ):
		return "HTTP_SEC_WEBSOCKET_KEY" in query.environ
	
	def make_frame( self, payload, opcode=1 ):
		#                FrrrOOOOMLLLLLLL
		frame_header = 0b1000000000000000 # finished, unmasked (server-to-client), continuation (opcode=0) frame with zero payload length
		frame_header |= opcode << 8 # store opcode in frame header
		frame = bytes()
		if type(payload)==str:
			payload = payload.encode( "utf-8" )
		length = len(payload)
		if length<126:
			frame_header |= length
			frame += struct.pack( ">H", frame_header )
		elif length<2**16:
			frame_header |= 126
			frame += struct.pack( ">H", frame_header )
			frame += struct.pack( ">H", length )
		elif length<2**64:
			frame_header |= 127
			frame += struct.pack( ">H", frame_header )
			frame += struct.pack( ">Q", length )
		else:
			raise errors.StateError( "Encountered unsupported payload length of %d" % (length) )
		frame += payload
		return frame
		
	class Frame():
		def __init__( self, s ):
			frame = bytes()
			frame += s.recv(2)
			op, length = struct.unpack( ">BB", frame[0:2] )
			fin = (op & 2**7)!=0
			op &= 2**4-1
			masked = (length & 2**7)!=0
			length &= 2**7-1
			if not fin:
				raise NotImplementedError( "FIXME: Unable to handle fragmented frames" )
			if op not in (1,8,9,10):
				raise NotImplementedError( "FIXME: Only text messages supported" )
			if op==9:
				pass #FIXME
				#print( "WebSocket PING received from client %s" % (self.app.query.remote_addr) )
			if op==10:
				pass #FIXME
				#print( "WebSocket PONG received from client %s" % (self.app.query.remote_addr) )
			payload_offset = 2
			if length == 126:
				frame += s.recv(2)
				length = struct.unpack( ">H", frame[2:2+2] )[0]
				payload_offset += 2
			elif length == 127:
				frame += s.recv(8)
				length = struct.unpack( ">Q", frame[2:2+8] )[0]
				payload_offset += 8
			if masked:
				frame += s.recv(4)
				mask = frame[ payload_offset : payload_offset+4 ]
				payload_offset += 4
			frame += s.recv(length)
			payload = frame[ payload_offset : payload_offset+length ]
			if masked:
				decoded_payload = b""
				for i in range(len(payload)):
					decoded_payload += struct.pack( ">B", payload[i] ^ mask[i%4] )
				payload = decoded_payload
			if op==8:
				self.reason = 0
				if len(payload)>=2:
					# The Close frame MAY contain a body [...] If there is a body, the first 
					# two bytes of the body MUST be a 2-byte unsigned integer (in network 
					# byte order) representing a status code with value /code/ defined in 
					# Section 7.4.
					self.reason = struct.unpack( ">H", payload[0:2] )[0]
				payload = payload[2:]
			self.op = op
			self.is_text = self.op==1
			self.is_binary = self.op==2
			self.is_close = self.op==8
			self.is_ping = self.op==9
			self.is_pong = self.op==10
			self.payload = payload
			self.text = None
			if self.is_text:
				self.text = payload.decode("utf-8")
			
	def read_frames_from_client( self ):
		while not self.quitting:
			try:
				frame = self.Frame( self.socket )
				self.last_msg_received = time.time()
			except OSError as e:
				print( "WebSocket client %s hung up? Initiating server-side shutdown." % (self.app.query.remote_addr) )
				self.quitting = True
				return
			if frame.is_text:
				self.client_messages_semaphore.acquire()
				self.client_messages.append( frame.text )
				self.client_messages_semaphore.release()
				self.client_message_event.set()
			elif frame.is_close:
				print( "WebSocket CLOSE reason from client %s: %d (%s)" % (self.app.query.remote_addr, frame.reason, frame.payload) )
				self.quitting = True
			elif frame.is_ping:
				print( "WebSocket PING from client %s (%s)" % (self.app.query.remote_addr, frame.payload) )
				self.send( frame.payload, opcode=10 )
			elif frame.is_pong:
				print( "WebSocket PONG from client %s (%s)" % (self.app.query.remote_addr, frame.payload) )
				self.roundtrip_times = self.roundtrip_times[-9:].append( int(1000*(time.time()-float(frame.payload.decode("utf-8")))) )
				print( "WebSocket recent round trip times (ms): %s" % (str(self.roundtrip_times)) )
		print( "WebSocket-Shutdown (read_frames_from_client %s)" % (self.app.query.remote_addr) )
	
	def send( self, message, opcode=1 ):
		"""Highlevel thread-safe interface for sending messages to the client 
			from the server-side application endpoint. Actual sending is been
			done from elsewhere."""
		self.server_data_semaphore.acquire()
		self.server_data += self.make_frame( message, opcode=opcode )
		self.server_data_semaphore.release()
	
	def communicate( self ):
		"""Forward data provided by the server-side application endpoint 
			to the WebSocket server and forward messages originating from the
			client up to the onmessage handler of the server-side application endpoint."""
		# 1.) Check for decoded frames from the client and forward them
		# to the server-side endpoint for consumtion:
		self.client_messages_semaphore.acquire()
		client_message_count = 0
		while self.client_messages:
			self.onmessage( self.client_messages.pop() )
			client_message_count += 1
		self.client_messages_semaphore.release()
		self.client_message_event.clear()
		if time.time() > self.last_msg_received+self.keep_alive_timeout:
			self.send( str(time.time()), opcode=9 ) # send PING as a keep alive message
			self.last_msg_received = time.time()
		# 2.) Check if we have frame data from send calls of the server-side endpoint,
		# that we can forward to the WebSocket server:
		self.server_data_semaphore.acquire()
		server_chunk = self.server_data
		if len(server_chunk):
			self.server_data = self.server_data[len(server_chunk):]
		self.server_data_semaphore.release()
		return server_chunk
	
	def close( self ):
		print( "WebSocket-Shutdown (closing %s)..." % (self.app.query.remote_addr) )
		# request Termination on the server-side application endpoint:
		self.endpoint.stop()
		self.endpoint.join() # wait on the endpoint thread
		# signalize Termination to input and output subroutines:
		self.quitting = True
		self.client_reader.join() # wait on client reader thread
		self.app.log( "WebSocket-Shutdown (closed %s)." % (self.app.query.remote_addr) )
