import time, json
from lib import user

def initialize( ws_server ):
	ws_server.cmd_queue = []
	ws_server.game_id = int(ws_server.app.query.parms["game_id"])
	ws_server.board_state = {}
	ws_server.board_history = []
	ws_server.max_move_sent_offset = None

def process_message( ws_server, msg ):
	action = json.loads( msg )
	ws_server.cmd_queue.append( action )

def run( ws_server ):
	result = {}
	if ws_server.app.user.can_read( ws_server.game_id ):
		c = ws_server.app.db.cursor()
		max_move_id = None if ws_server.board_history==[] else ws_server.board_history[-1]["move_id"]
		max_move_condition = "" if max_move_id==None else (" and id>%d" % (max_move_id))
		c.execute( """select id, game_id, player_id, mtime, figure, from_field, to_field from chess_games where game_id=? %s""" \
						% (max_move_condition), [ws_server.game_id] )
		for row in c:
			move_id, _game_id, player_id, mtime, figure, from_field, to_field = row
			ws_server.board_state[from_field] = None
			ws_server.board_state[to_field] = figure
			move = {
				"move_id" : move_id,
				"game_id" : ws_server.game_id,
				"player_id" : player_id,
				"mtime" : mtime,
				"figure" : figure,
				"from_field" : from_field,
				"to_field" : to_field
			}
			ws_server.board_history.append( move )
		if not ws_server.max_move_sent_offset and not ws_server.board_history:
			c = ws_server.app.db.cursor()
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
							[ws_server.game_id, user.get_anonymous_user(ws_server.app).id, time.time(), initial_board_setting] )
		result.update({ "succeeded" : True, "actions" : ws_server.board_history[ws_server.max_move_sent_offset:] })
		ws_server.max_move_sent_offset = len(ws_server.board_history)
	if ws_server.app.user.can_write( ws_server.game_id ):
		if ws_server.cmd_queue:
			action = ws_server.cmd_queue.pop(0)
			result["succeeded"] = True
			# TODO: Aktion validieren
			whites = "♔♕♖♗♘♙"
			blacks = "♚♛♜♝♞♟"
			get_color = lambda f: "white" if f in whites else "black" if f in blacks else None
			if get_color(action.figure)==None:
				result.update({ "succeeded" : False, "error" : { "message" : "Unknown figure code!" } })
			elif ws_server.board_history and get_color(ws_server.board_history[-1].figure)==get_color(action.figure):
				result.update({ "succeeded" : False, "error" : { "message" : "Wrong color!" } })
			elif ws_server.board_history and ws_server.board_history[-1].player_id==ws_server.app.user.id:
				result.update({ "succeeded" : False, "error" : { "message" : "Double action not permitted!" } })
			else:
				c = ws_server.app.db.cursor()
				c.execute( """insert into chess_games (game_id, player_id, mtime, figure, from_field, to_field)
								values(?,?,?,?,?,?)""", 
								[ws_server.game_id, ws_server.app.user.id, time.time(), action["figure"], action["from_field"], action["to_field"]] )
	if result:
		ws_server.ws.send( json.dumps(result) )

def sleep( ws_server ):
	time.sleep( 1 )

