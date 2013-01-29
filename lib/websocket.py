import base64, hashlib, imp, struct, time, signal, threading, traceback
from lib import errors
errors = imp.reload( errors )

class WebSocket:
	def __init__( self, app, endpoint ):
		if not self.can_handle( app.query ):
			raise errors.ParameterError( "HTTP Request does not seem to be a WebSocket handshake initiation" )
		if not isinstance( endpoint, threading.Thread ):
			raise errors.InternalProgramError( "WebSocket endpoint needs to be an instance of Thread" )
		if not hasattr( endpoint, "stop" ):
			self.app.trace( "Warning: WebSocket endpoint %s should implement stop()" % str(endpoint) )
		self.app = app
		endpoint.websocket = self
		self.endpoint = endpoint
		if hasattr(endpoint,"onmessage"):
			self.onmessage = endpoint.onmessage
		else:
			self.onmessage = lambda x: None
		self.prepare_handshake()
		self.input = app.query.environ["wsgi.input"]
		self.client_data = b""
		self.client_data_semaphore = threading.Semaphore()
		self.server_data = b""
		self.server_data_semaphore = threading.Semaphore()
		self.server_data_sent_offset = 0
		self.quitting = False
		self.client_reader = threading.Thread( target=self.read_client_bytes )
		self.client_reader.start()
		self.endpoint.start()
	
	def prepare_handshake( self ):
		response = self.app.response
		query = self.app.query
		ws_key = query.environ["HTTP_SEC_WEBSOCKET_KEY"]
		# https://tools.ietf.org/html/rfc6455
		ws_guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
		ws_accept = base64.b64encode( hashlib.sha1( (ws_key+ws_guid).encode("utf-8") ).digest() ).decode("utf-8")
		response.response_headers.append( ('Sec-WebSocket-Accept', ws_accept) )
		response.response_headers.append( ('Connection', 'Upgrade') )
		response.response_headers.append( ('Upgrade', 'websocket') )
		response.content_length = 2**32-1 # FIXME: Hack to prevent Transfer-Coding: chunked
		response.status = '101 Switching Protocols'
	
	@classmethod
	def can_handle( cls, query ):
		return "HTTP_SEC_WEBSOCKET_KEY" in query.environ
	
	def make_frame( self, payload ):
		#                FrrrOOOOMLLLLLLL
		frame_header = 0b1000000100000000 # finished, unmasked (server-to-client), text (opcode=1) frame with zero payload length
		frame = bytes()
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
		frame += payload.encode( "utf-8" )
		return frame
	
	def decode_frame( self, frame ):
		if len(frame)<2:
			return 0, ""
		op, length = struct.unpack( ">BB", frame[0:2] )
		fin = (op & 2**7)!=0
		op &= 2**4-1
		masked = (length & 2**7)!=0
		length &= 2**7-1
		if not fin:
			raise NotImplementedError( "FIXME: Unable to handle fragmented frames" )
		if op not in (1,8,9,10):
			raise NotImplementedError( "FIXME: Only text messages supported" )
		if op==8:
			self.app.trace( "WebSocket CLOSE received from client %s" % (self.app.query.remote_addr) )
			self.quitting = True
		if op==9:
			self.app.trace( "WebSocket PING received from client %s" % (self.app.query.remote_addr) )
		if op==10:
			self.app.trace( "WebSocket PONG received from client %s" % (self.app.query.remote_addr) )
		payload_offset = 2
		if length == 126:
			if len(frame)<payload_offset+2:
				return 0, ""
			length = struct.unpack( ">H", frame[2:2+2] )
			payload_offset += 2
		elif length == 127:
			if len(frame)<payload_offset+8:
				return 0, ""
			length = struct.unpack( ">Q", frame[2:2+8] )
			payload_offset += 8
		if masked:
			if len(frame)<payload_offset+4:
				return 0, ""
			mask = frame[ payload_offset : payload_offset+4 ]
			payload_offset += 4
		if len(frame)<payload_offset+length:
			return 0, ""
		payload = frame[ payload_offset : payload_offset+length ]
		if masked:
			decoded_payload = b""
			for i in range(len(payload)):
				decoded_payload += struct.pack( ">B", payload[i] ^ mask[i%4] )
			payload = decoded_payload
		if op==8 and len(payload)>=2:
			# The Close frame MAY contain a body [...] If there is a body, the first 
			# two bytes of the body MUST be a 2-byte unsigned integer (in network 
			# byte order) representing a status code with value /code/ defined in 
			# Section 7.4.
			reason = struct.unpack( ">H", payload[0:2] )[0]
			payload = payload[2:]
			if len(payload):
				reason_string = payload
			else:
				reason_string = "?"
			self.app.trace( "WebSocket CLOSE reason from client %s: %d (%s)" % (self.app.query.remote_addr, reason, reason_string) )
		return payload_offset+length, payload.decode("utf-8")
			
	def read_client_bytes( self ):
		while not self.quitting:
			try:
				byte = self.input.read(1)
			except OSError as e:
				self.app.trace( "WebSocket client %s hung up? Initiating server-side shutdown." % (self.app.query.remote_addr) )
				self.quitting = True
				return
			self.client_data_semaphore.acquire()
			self.client_data += byte
			self.client_data_semaphore.release()
		self.app.trace( "WebSocket-Shutdown (read_client_bytes %s)" % (self.app.query.remote_addr) )
	
	def send( self, message ):
		"""Highlevel thread-safe interface for sending messages to the client 
			from the server-side application endpoint. Actual sending is been
			done from the WebSockets read method."""
		self.server_data_semaphore.acquire()
		self.server_data += self.make_frame( message )
		self.server_data_semaphore.release()
	
	def read( self, size ):
		"""Responsible for sending data provided by the server-side application endpoint 
			to the client and currently also for handing messages originating from the
			client up to the onmessage handler of the server-side application endpoint."""
		while not self.quitting:
			# 1.) Check if we can decode a complete frame from the client and hand it up
			# to the server-side endpoint for consumtion:
			self.client_data_semaphore.acquire()
			try:
				client_read_length, client_message = self.decode_frame( self.client_data )
				if client_read_length>0:
					self.client_data = self.client_data[client_read_length:]
			except Exception as e:
				# decode_frame should leave incomplete frames untouched, by returning a zero chunk,
				# but must raise exceptions on fatal parse errors. Ignoring erroneous input would 
				# leave the socket in an unusable exception loop. Discarding arbitrary chunks of 
				# input on the other hand would probably lead to subsequent errors, so the only 
				# sane option in this situation is to close the socket in a controlled manner:
				self.app.log( "\n".join(traceback.format_exception(Exception, e, e.__traceback__)) )
				self.close()
				raise
			self.client_data_semaphore.release()
			if client_read_length>0:
				self.onmessage( client_message )
			# 2.) Check if we have frame data from send calls of the server-side endpoint,
			# that we can hand down to the webserver:
			self.server_data_semaphore.acquire()
			server_chunk = self.server_data[0:size]
			if len(server_chunk):
				self.server_data = self.server_data[len(server_chunk):]
			self.server_data_semaphore.release()
			if len(server_chunk):
				return server_chunk
			# 3.) Check if we did anything at all and take a nap if not so:
			if client_read_length==0 and not len(server_chunk):
				time.sleep(0.1)
		self.app.trace( "WebSocket-Shutdown (read %s)" % (self.app.query.remote_addr) )
		# return zero size buffer to signalize eof:
		return b''
	
	def close( self ):
		self.app.trace( "WebSocket-Shutdown (closing %s)..." % (self.app.query.remote_addr) )
		# request Termination on the server-side application endpoint:
		self.endpoint.stop()
		self.endpoint.join() # wait on the endpoint thread
		# signalize Termination to input and output subroutines:
		self.quitting = True
		self.client_reader.join() # wait on client reader thread
		self.app.log( "WebSocket-Shutdown (closed %s)." % (self.app.query.remote_addr) )
