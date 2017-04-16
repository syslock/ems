import time

def initialize( ws_server ):
	ws_server.cmd_queue = []
	ws_server.sent_state = {}

def process_message( ws_server, msg ):
	keycode = int(msg)
	action_map = {
		37: (-32,0),
		38: (0,-32),
		39: (32,0),
		40: (0,32)
	}
	action = action_map[keycode]
	ws_server.cmd_queue.append( action )

def run( ws_server ):
	if ws_server.app.user.can_write( ws_server.app.user.id ):
		while ws_server.cmd_queue:
			action = ws_server.cmd_queue.pop(0)
			c = ws_server.app.db.cursor()
			state = c.execute( """select object_id, x, y from player_positions where object_id=?""", [ws_server.app.user.id] ).fetchone()
			if state:
				c.execute( """update player_positions set x=x+?, y=y+? where object_id=?""", [action[0], action[1], ws_server.app.user.id] )
				ws_server.app.db.commit()
			else:
				c.execute( """insert into player_positions (object_id, x, y) values (?,?,?)""", [ws_server.app.user.id, action[0], action[1]] )
				ws_server.app.db.commit()
	else:
		ws_server.cmd_queue.clear()
	result = {}
	c = ws_server.app.db.cursor()
	c.execute( """select p.object_id, p.x, p.y, u.nick from player_positions p inner join users u on p.object_id=u.object_id""" )
	for row in c:
		if ws_server.app.user.can_read( row[0] ):
			state = {"id":row[0], "x":row[1], "y":row[2], "nick":row[3]}
			str_id = "id"+str(state["id"])
			if str_id not in ws_server.sent_state or state!=ws_server.sent_state[str_id]:
				ws_server.sent_state[ str_id ] = result[ str_id ] = state
	if result:
		ws_server.ws.send( str(result) )

def sleep( ws_server ):
	time.sleep( 0.2 )
