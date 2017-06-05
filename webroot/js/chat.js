var Chat = function() {
	var my = this;
	my.players = {};
	my.ws = null;
	
	my.send = function( msg ) {
		my.ws.send( JSON.stringify(msg) );
	}
	
	my.connect = function() {
		if( my.ws!=null ) my.ws.close();
		my.ws = new WebSocket( get_ws_url("?do=chat") );
		my.ws.onmessage = my.recv;
	};
	
	my.recv = function( event ) {
		var msg = parse_result( event.data );
		if( GlobalStatusBar ) {
			GlobalStatusBar.add_message( {source: msg.src, text:msg.msg, emblem_css:{"background-color":"blue"}} )
			GlobalStatusBar.show();
		}
	};
} // Chat
