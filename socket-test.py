import socket, threading, time, sys, os
from lib import application
from lib import websocket

s = socket.socket()
s.bind(('0.0.0.0',8888))
s.listen(0)
try:
	while True:
		con,addr = s.accept()
		class WSTest( threading.Thread ):
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
				for hl in headlines[1:]:
					print( hl )
					key, val = hl.split(": ")
					environ["HTTP_"+key.upper().replace("-","_")] = val
				self.app = application.Application( environ, lambda x,y: None, name="ems", path=os.path.dirname(sys.argv[0]) )
				self.ws = websocket.WebSocket( self.app, self.con, self )
				self.ws.send_handshake()
				self.cmd_queue = []
				super().__init__()
			def onmessage( self, msg ):
				print( msg )
				try:
					keycode = int(msg)
					action_map = {
						37: (-32,0),
						38: (0,-32),
						39: (32,0),
						40: (0,32)
					}
					action = action_map[keycode]
					self.cmd_queue.append( action )
				except:
					return 
				
			def stop( self ):
				self.con.close()
				self.quitting = True
			def run( self ):
				def read_thread():
					while not self.quitting:
						data = self.ws.read(1000)
						if data:
							self.con.send( data )
						else:
							print( "%s disconnected." % (str(self.addr)) )
							break
				t = threading.Thread( target=read_thread )
				t.start()
				sent_state = {}
				self.app.open_db() # App-DB für diesen Thread neu öffnen...
				while not self.quitting:
					if self.app.user.can_write( self.app.user.id ):
						while self.cmd_queue:
							action = self.cmd_queue.pop(0)
							c = self.app.db.cursor()
							state = c.execute( """select object_id, x, y from player_positions where object_id=?""", [self.app.user.id] ).fetchone()
							if state:
								c.execute( """update player_positions set x=x+?, y=y+? where object_id=?""", [action[0], action[1], self.app.user.id] )
								self.app.db.commit()
							else:
								c.execute( """insert into player_positions (object_id, x, y) values (?,?,?)""", [self.app.user.id, action[0], action[1]] )
								self.app.db.commit()
					else:
						self.cmd_queue.clear()
					result = {}
					c = self.app.db.cursor()
					c.execute( """select p.object_id, p.x, p.y, u.nick from player_positions p inner join users u on p.object_id=u.object_id""" )
					for row in c:
						if self.app.user.can_read( row[0] ):
							state = {"id":row[0], "x":row[1], "y":row[2], "nick":row[3]}
							str_id = "id"+str(state["id"])
							if str_id not in sent_state or state!=sent_state[str_id]:
								sent_state[ str_id ] = result[ str_id ] = state
					if result:
						self.ws.send( str(result) )
					time.sleep( 0.2 )
		t = WSTest( con, addr )
		t.start()
except:
	s.close()
