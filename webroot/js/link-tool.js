// FIXME: module encapsulation:
var LinkTool = null;

define( ["jquery"], function($) {
	LinkTool = function( parms ) {
		var my = this;
		my.link_node = parms.link_node;
		my.confirm_callback = parms.confirm_callback;
		my.init();
	}
	
	LinkTool.prototype.init = function() {
		var my = this;
		if( my.template==undefined ) {
			// FIXME: We should try to do only one request for the template,
			//        even if a bunch of objects are initiated the same time,
			//        e.g. at initial page load.
			GlobalRequestQueue.add({
				module : "render",
				args : {tpl : "elements/link_tool.html"},
				done : function(result) {
					LinkTool.prototype.template = result;
					my.init();
				}, 
				fail : function(result) {
					parse_result( result );
				}
			});
			GlobalRequestQueue.process();
		} else {
			my.dom_object = $('<div></div>').html( my.template ).contents();
			my.dom_object.insertBefore( my.link_node );
			my.dom_object.attr( 'contentEditable', false );
			
			my.url_entry = $('.link-url', my.dom_object);
			var new_url = $(my.link_node).attr('href');
			my.url_entry.text( new_url ? new_url : 'http://' );
			my.url_entry.attr( {'contentEditable' : true} );
			my.text_entry = $('.link-text', my.dom_object);
			my.text_entry.html( $(my.link_node).html() );
			my.text_entry.attr( {'contentEditable' : true} );
			my.confirm_button = $('.link-tool-confirm', my.dom_object);
			my.confirm_button.on( 'click', function(e) { my.confirm(e); } );
			my.remove_button = $('.link-tool-remove', my.dom_object);
			my.remove_button.on( 'click', function(e) { my.remove(e); } );
		}
	}
	
	LinkTool.prototype.close = function() {
		var my = this;
		my.dom_object.remove();
	}
	
	LinkTool.prototype.confirm = function( event ) {
		var my = this;
		if( my.confirm_callback ) {
			my.confirm_callback( {'url': my.url_entry.text(), 'text': my.text_entry.html()} );
		} else {
			$(my.link_node).html( my.text_entry.html() );
			$(my.link_node).attr( {'href': my.url_entry.text()} );
		}
		my.close();
	}
	
	LinkTool.prototype.remove = function( event ) {
		var my = this;
		$(my.link_node).replaceWith( $(my.link_node).contents() );
		my.close();
	}

	return LinkTool;
}); //define()
