var SearchBar = function ( parms ) {
	var my = this;
	my.entry_parent = parms.entry_parent;
	my.result_parent = parms.result_parent;
	
	my.handle_key_event = function( evt ) {
		switch( evt.which )
		{
			case 13:
				my.search();
				break;
			case 40:
				my.select_hint('next');
				break;
			case 38:
				my.select_hint('prev');
				break;
			default:
				my.apropos();
				if( my.auto_search_timeout ) window.clearTimeout( my.auto_search_timeout );
				my.auto_search_timeout = window.setTimeout( function(){my.search()}, 2000 );
		}
	};
	
	my.search = function() {
		get_module( 'search', {args : {phrase : my.entry.val(), types : 'application/x-obj.entry'},
			done : function(result) {
				my.result_parent.text( result );
			}
		} );
	};
	
	my.apropos_word = null;
	my.apropos = function() {
		var word = get_cursor_word( my.entry[0] );
		if( word && word != my.apropos_word ) {
			my.apropos_word = word;
			get_module( 'search', {args : {apropos : word},
				done : function(result) {
					result = parse_result( result );
					my.apropos_spacer.text( get_input_text_before_cursor(my.entry[0], {remove_trailing_word: true}) );
					my.apropos_hints.empty();
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
	
	my.select_hint = function() {};
	
	get_tpl( "elements/searchbar.html", { done : function(result) {
		my.entry_parent.html( result );
		my.entry = $( ".searchbar", my.entry_parent );
		my.entry.on( 'keyup', my.handle_key_event );
		my.apropos_hints = $( ".apropos-hints", my.entry_parent );
		my.apropos_spacer = $( ".apropos-spacer", my.entry_parent );
	}, fail : function(result) {
		show_error( result )
	} } );
} // SearchBar
