var ChessGame = {
	var my = this;
	my.game_id = null;
	my.ws = null;
	
	my.init = function( _dom_parent, _game_id) {
		my.dom_parent = _dom_parent;
		if( _game_id!=null ) {
			get_module( 'store', {
				args : {type : 'application/x-obj.chessgame'},
				done : function( result ) {
					result = parse_result( result )
					if( result.succeeded && result.id!=undefined ) {
						my.game_id = Number(result.id);
						my.connect();
					}
				}
			});
		} else {
			my.game_id = _game_id;
			my.connect();
		}
	};
	
	my.connect = function() {
		if( my.ws!=null ) my.ws.close();
		my.ws = new WebSocket( get_ws_url("/chessgame_state/"+String(my.game_id)) );
		my.ws.onmessage = my.render_action;
	};
	
	my.render_action = function( event ) {
		// ♔♕♖♗♘♙♚♛♜♝♞♟
		var result = parse_result( event.data );
		if( result.actions ) {
			for( var i in result.actions ) {
				var move = result.actions[i];
				
				if( result.figure.length==64 ) {
					// komplette Feld-Belegung, z.B. zu Spielbeginn:
					for( var n=0; n<64; n++ ) {
						var figure = result.figure.substr(n,1);
						var col = n%8;
						var row = Math.floor(n/8);
						var to_field_id = String.fromCharCode(row+65)+String(col);
						var to_field = $( ".chess_field_"+to_field_id, my.dom_parent );
						to_field.text( figure );
					}
				} else {
					var from_field = $( ".chess_field_"+move.from_field, my.dom_parent );
					var from_figure_ui = from_field.text();
					if( from_figure_ui != move.figure ) {
						show_error( "Synchronisationsproblem: Server erwartet auf Feld "+move.from+" eine(n) "+move.figure+". UI hat dort aber eine(n) "+move.figure+"." );
						return;
					}
					var to_field = $( ".chess_field_"+move.to_field, my.dom_parent );
					var to_figure_ui = to_field.text();
					from_field.empty();
					to_field.text( move.figure );
				}
			}
		}
	};
};