import socket, threading, time, sys, os, json
from lib import application
from lib import websocket
from lib import user

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
				self.method, self.uri, self.protocol = headlines[0].split()
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
					if self.uri == "/player_state":
						keycode = int(msg)
						action_map = {
							37: (-32,0),
							38: (0,-32),
							39: (32,0),
							40: (0,32)
						}
						action = action_map[keycode]
						self.cmd_queue.append( action )
					elif self.uri.starts_with( "/chessgame_state/" ):
						action = json.loads( msg )
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
				if self.uri == "/player_state" :
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
				elif self.uri.starts_with( "/chessgame_state/" ):
					empty, channel, game_id = self.uri.split("/")
					game_id = int(game_id)
					board_state = {}
					board_history = []
					max_move_sent_offset = None
					while not self.quitting:
						result = {}
						if self.app.user.can_read( game_id ):
							c = self.app.db.cursor()
							max_move_id = None if board_history==[] else board_history[-1]["move_id"]
							max_move_condition = "" if max_move_id==None else (" and id>%d" % (max_move_id))
							c.execute( """select id, game_id, player_id, mtime, figure, from_field, to_field from chess_games where game_id=? %s""" \
											% (max_move_condition), [game_id] )
							for row in c:
								move_id, _game_id, player_id, mtime, figure, from_field, to_field = row
								board_state[from_field] = None
								board_state[to_field] = figure
								move = {
									"move_id" : move_id,
									"game_id" : game_id,
									"player_id" : player_id,
									"mtime" : mtime,
									"figure" : figure,
									"from_field" : from_field,
									"to_field" : to_field
								}
								board_history.append( move )
							if not max_move_sent_offset and not board_history:
								c = self.app.db.cursor()
								initial_board_setting = "♜♞♝♛♚♝♞♜" \
													   +"♟♟♟♟♟♟♟♟" \
													   +"        " \
													   +"        " \
													   +"        " \
													   +"        " \
													   +"♙♙♙♙♙♙♙♙" \
													   +"♖♘♗♕♔♗♘♖"
								initial_board_setting = "".join( reversed(initial_board_setting) )
								c.execute( """insert into chess_games (game_id, player_id, mtime, figure)
												values(?,?,?,?)""",
												[game_id, user.get_anonymous_user(self.app).id, time.time(), initial_board_setting] )
								self.app.db.commit()
							result.update({ "succeeded" : True, "actions" : board_history[max_move_sent_offset:] })
							max_move_sent_offset = len(board_history)
						if self.app.user.can_write( game_id ):
							if self.cmd_queue:
								action = self.cmd_queue.pop(0)
								result["succeeded"] = True
								# TODO: Aktion validieren
								whites = "♔♕♖♗♘♙"
								blacks = "♚♛♜♝♞♟"
								get_color = lambda f: "white" if f in whites else "black" if f in blacks else None
								if get_color(action.figure)==None:
									result.update({ "succeeded" : False, "error" : { "message" : "Unknown figure code!" } })
								elif board_history and get_color(board_history[-1].figure)==get_color(action.figure):
									result.update({ "succeeded" : False, "error" : { "message" : "Wrong color!" } })
								elif board_history and board_history[-1].player_id==self.app.user.id:
									result.update({ "succeeded" : False, "error" : { "message" : "Double action not permitted!" } })
								else:
									c = self.app.db.cursor()
									c.execute( """insert into chess_games (game_id, player_id, mtime, figure, from_field, to_field)
													values(?,?,?,?,?,?)""", 
													[game_id, self.app.user.id, time.time(), action["figure"], action["from_field"], action["to_field"]] )
									self.app.db.commit()
						if result:
							self.ws.send( json.dumps(result) )
						time.sleep( 1 )
		t = WSTest( con, addr )
		t.start()
except:
	s.close()
