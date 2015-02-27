var SearchBar = function ( parms ) {
	var my = this;
	my.entry_parent = parms.entry_parent;
	my.result_callback = parms.result_callback;
	my.outer_width = parms.outer_width;
	
	my.handle_keydown_event = function( evt ) {
		var propagate = true;
		switch( evt.which )
		{
			case 13: // Enter
				propagate = false; // prevent line breaks in contentEditable div
				break;
		}
		return propagate;
	};
	
	my.handle_keyup_event = function( evt ) {
		var propagate = true;
		switch( evt.which )
		{
			case 13: // Enter
				my.hide_apropos_hints();
				my.search();
				break;
			case 27: // Escape
				my.hide_apropos_hints();
				break;
			case 40: // Down
				my.select_apropos_hint('next');
				break;
			case 38: // Up
				my.select_apropos_hint('prev');
				break;
			default:
				my.show_apropos_hints();
				if( my.auto_search_timeout ) window.clearTimeout( my.auto_search_timeout );
				my.auto_search_timeout = window.setTimeout( function() {
					my.hide_apropos_hints();
					my.search();
				}, 2000 );
		}
		return propagate;
	};
	
	my.search = function() {
		get_module( 'search', {args : {phrase : my.entry.text(), types : 'application/x-obj.entry', order_by: 'ctime', reverse: 'true'},
			done : function(result) {
				result = parse_result( result );
				my.result_callback( result );
			}
		} );
	};
	
	my.apropos_word = null;
	my.show_apropos_hints = function() {
		var word = get_cursor_word( my.entry[0], {separators:" \t\n\r:"} );
		if( word && word != my.apropos_word ) {
			my.apropos_word = word;
			get_module( 'search', {args : {apropos : word},
				done : function(result) {
					result = parse_result( result );
					my.apropos_spacer.text( get_input_text_before_cursor(my.entry[0], {remove_trailing_word: true, separators:" \t\n\r:"}) );
					my.apropos_hints.empty();
					my.apropos_hints.show();
					for( var i=0; i<result.length; i++ ) {
						my.apropos_hints.append( $('<div>').text(result[i][0]).addClass('apropos-hint') )
					}
					var sel = window.getSelection();
					if( sel.rangeCount ) {
						var rg = sel.getRangeAt(0);
						var rect = rg.getBoundingClientRect();
					}
				}
			} );
		}
	};
	
	my.select_apropos_hint = function() {};
	
	my.hide_apropos_hints = function() {
		my.apropos_hints.hide();
	};
	
	get_tpl( "elements/searchbar.html", { done : function(result) {
		my.entry_parent.html( result );
		my.entry = $( ".searchbar-entry", my.entry_parent );
		my.entry[0].contentEditable = true;
		my.entry.outerWidth( my.outer_width );
		my.entry.css( 'min-width', my.entry.css('width') );
		my.entry.css( 'width', '' );
		my.entry.on( 'keydown', my.handle_keydown_event );
		my.entry.on( 'keyup', my.handle_keyup_event );
		my.apropos_hints = $( ".apropos-hints", my.entry_parent );
		my.apropos_spacer = $( ".apropos-spacer", my.entry_parent );
	}, fail : function(result) {
		show_error( result )
	} } );
} // SearchBar
