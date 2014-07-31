var Player = function ( parms ) {
	var my = this;
	my.nick = parms.nick;
	my.running = false;
	my.standing = null;
	my.moving = null;
	my.is_moving = false;
	my.move_lock = false;
	my.move_counter = 0;
	my.animation_parts = 5;
	my.current_x = parms.x ? parms.x : 100;
	my.current_y = parms.y ? parms.y : 100;
	my.char_width = 32;
	my.char_height = 32;
	my.direction = null;
	my.interval = null;
	my.canvas = $("<canvas>").attr( {width:my.char_width, height:my.char_height} ).addClass( "player-canvas" ).appendTo('body')[0];
	my.c = my.canvas.getContext("2d");
	my.anim_start = null;
	
	my.move_char = function () {
		if ( my.is_moving != null )
		{
			var image = my.standing;
			if ( my.animation_parts == 5 )
			{
				if ( my.move_counter >= 0 && my.move_counter <= 2 )
				{
					image = my.get_image("images/dummy_sprite_"+my.direction+"1.png");
				}
				else if ( my.move_counter >= 3 && my.move_counter <= 5 )
				{
					image = my.get_image("images/dummy_sprite_"+my.direction+"2.png");
				}
			}
			else
			{
				if ( my.move_counter >= 0 && my.move_counter <= 2 )
				{
					image = my.get_image("images/dummy_sprite_"+my.direction+"1.png");
				}
				else if ( my.move_counter >= 3 && my.move_counter <= 5 )
				{
					image = my.get_image("images/dummy_sprite_"+my.direction+".png");
				}
				else if ( my.move_counter >= 6 && my.move_counter <= 8 )
				{
					image = my.get_image("images/dummy_sprite_"+my.direction+"2.png");
				}
			}
			var old_x = my.current_x;
			var old_y = my.current_y;
			my.current_y = my.current_y + my.diff.y/my.animation_parts;
			my.current_x = my.current_x + my.diff.x/my.animation_parts;
			my.c.clearRect(0, 0, my.char_width, my.char_height);
			my.c.drawImage(image, 0, 0, my.char_width, my.char_height);
			my.canvas.style.left = my.current_x+"px";
			my.canvas.style.top = my.current_y+"px";
			my.move_counter = my.move_counter + 1;
			if ( my.move_counter >= my.animation_parts )
			{
				clearInterval(my.interval);
				my.move_counter = 0;
				my.is_moving = false;
				my.move_lock = false;
				my.diff = {x:0, y:0}
				my.running = false;
				if( my.post_anim_correction_time > my.anim_start 
					&& (Math.round(my.post_anim_correction_pos.x)!=Math.round(my.current_x)
						|| Math.round(my.post_anim_correction_pos.y)!=Math.round(my.current_y)) ) {
					my.start_moving( my.post_anim_correction_pos );
				} else {
					my.c.clearRect(0, 0, my.char_width, my.char_height);
					my.c.drawImage(my.standing, 0, 0, my.char_width, my.char_height);
				}
			}
		}
	};
	
	my.get_image = function (file) {
		var img = new Image();
		img.src = file;
		return img;
	};
	
	my.get_diff_from_dest = function (dest) {
		return {x: dest.x-my.current_x, y: dest.y-my.current_y};
	};
	
	my.get_dir_from_diff = function (diff) {
		if( Math.abs(diff.x) > Math.abs(diff.y) ) {
			if( diff.x>0 ) {
				return "right";
			} else {
				return "left";
			}
		} else {
			if( diff.y>0 ) {
				return "down";
			} else {
				return "up";
			}
		}
	}
	
	my.get_diff_from_dir = function( dir ) {
		var actions = {
			"left" : {x: -my.char_width, y: 0},
			"right" : {x: my.char_width, y: 0},
			"up" : {x: 0, y: -my.char_height},
			"down" : {x: 0, y: my.char_height}
		}
		return actions[ dir ];
	}
	
	my.start_moving = function (parms) {
		if ( my.running == false ) {
			clearInterval( my.interval );
			if( parms.dir ) {
				my.diff = my.get_diff_from_dir( parms.dir );
				my.direction = parms.dir;
			} else {
				my.diff = my.get_diff_from_dest( parms );
				my.direction = my.get_dir_from_diff( my.diff );
			}
			switch( my.direction ) {
				case "left":
				case "right":
					my.animation_parts = 8;
					break;
				case "down":
				case "up":
					my.animation_parts = 5;
					break;
			}
			my.standing = new Image();
			my.standing.src = "images/dummy_sprite_"+my.direction+".png";
			my.running = true;
			my.is_moving = true;
			my.anim_start = Date.now();
			my.interval = setInterval(my.move_char, 60);
		} else if( parms.x && parms.y ) {
			my.post_anim_correction_pos = parms;
			my.post_anim_correction_time = Date.now();
		}
	};
	
	my.handle_key_event = function (evt) {
		switch(evt.keyCode)
		{
			case 37:
				my.start_moving({dir:"left"});
				break;
			case 39:
				my.start_moving({dir:"right"});
				break;
			case 40:
				my.start_moving({dir:"down"});
				break;
			case 38:
				my.start_moving({dir:"up"});
				break;
		}
	};
} // Player

var PlayerNet = function() {
	var my = this;
	my.players = {};
	my.ws = null;
	
	my.handle_key_event = function( event ) {
		if( event.keyCode>=37 && event.keyCode<=40 ) {
			event.preventDefault();
			if( !my.my_player.running ) {
				my.ws.send( event.keyCode );
				my.my_player.handle_key_event( event );
			}
		}
	}
	
	my.init_my_player = function( user ) {
		if( my.players[user.nick] ) {
			my.my_player = my.players[user.nick];
		} else {
			my.my_player = new Player( {nick: user.nick, x: 100, y: 100} );
			my.players[ my.my_player.nick ] = my.my_player;
		}
		window.addEventListener( 'keydown', my.handle_key_event, true );
	}
	
	my.connect = function() {
		if( my.ws!=null ) my.ws.close();
		my.ws = new WebSocket( get_ws_url("/player_state") );
		my.ws.onmessage = my.get_player_state;
	};
	
	my.get_player_state = function( event ) {
		var player_state = parse_result( event.data );
		for( id in player_state ) {
			var player = player_state[id];
			if( !my.players[player.nick] ) {
				var new_player = new Player( {nick: player.nick, x: player.x, y: player.y} );
				my.players[ new_player.nick ] = new_player;
			}
			my.players[player.nick].start_moving( {x: player.x, y: player.y} );
		}
	};
} // PlayerNet

var player_net = new PlayerNet();
