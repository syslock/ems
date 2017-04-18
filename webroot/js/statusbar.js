// FIXME: module encapsulation:
var StatusBar = null;

define(["jquery"], function($) {
StatusBar = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	my.dom_parent = parms.dom_parent ? parms.dom_parent : document.documentElement;
	my.init( parms );
};

StatusBar.prototype.init = function( parms ) {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/statusbar.html"},
			done : function(result) {
				StatusBar.prototype.template = result;
				my.init( parms );
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		my.dom_object = $( "<div>" );
		my.dom_object.html( my.template );
		$(my.dom_parent).append( my.dom_object );
		my.statusbar = $( ".statusbar", my.dom_object );
		my.statusbar.unwrap();
		my.statusbar.on( "click", function() { my.statusbar_entry.focus(); } );
		my.statusbar_button_min = $( ".statusbar-button-min", my.statusbar );
		my.statusbar_button_min.on( "click", function() { my.toggle_min(); } );
		my.statusbar_button_max = $( ".statusbar-button-max", my.statusbar );
		my.statusbar_button_max.on( "click", function() { my.toggle_max(); } );
		my.statusbar_content = $( ".statusbar-content", my.statusbar );
		my.message_template = $( ".message-template", my.statusbar );
		my.statusbar_entry = $( ".statusbar-entry", my.statusbar );
		my.statusbar_entry.attr( { contenteditable: "true" } );
		my.statusbar_entry.on( "keydown", function(evt) { my.handle_keydown_event(evt); } )
		my.statusbar_entry.on( "keyup", function(evt) { my.handle_keyup_event(evt); } )
		my.hide();
	}
};

StatusBar.prototype.handle_keydown_event = function( evt ) {
	var my = this;
	var propagate = true;
	switch( evt.which )
	{
		case 13: // Enter
			propagate = false; // prevent line breaks in contentEditable div
			break;
		default:
			my.show();
			break;
	}
	return propagate;
};

StatusBar.prototype.handle_keyup_event = function( evt ) {
	var my = this;
	var propagate = true;
	switch( evt.which )
	{
		case 13: // Enter
			propagate = false; // prevent line breaks in contentEditable div
			my.add_message( {
				"emblem_css" : {"background-color": "blue"}, 
				"source" : global_user ? global_user.nick : "anonymous", 
				"text" : my.statusbar_entry.text()
			} );
			my.statusbar_entry.text("");
			break;
		case 27: // Escape
			propagate = false;
			my.hide();
			break;
	}
	return propagate;
};

StatusBar.prototype.add_message = function( parms ) {
	var my = this;
	var cls = parms.class ? parms.class : "message";
	var css = parms.css ? parms.css : {};
	var emblem_css = parms.emblem_css ? parms.emblem_css : {};
	var source = parms.source ? parms.source : "system";
	var text = parms.text ? parms.text : "";
	var timestamp = (new Date()).toLocaleTimeString();
	var message = my.message_template.clone().removeClass( "message-template").addClass( cls ).css( css );
	var message_emblem = $( ".message-emblem", message ).css( emblem_css );
	var message_time = $( ".message-time", message );
	message_time.text( timestamp );
	var message_source = $( ".message-source", message );
	message_source.text( source );
	var message_text = $( ".message-text", message );
	message_text.text( text );
	my.statusbar_content.append( message );
	message.show();
	my.scroll_to_bottom();
};

// https://stackoverflow.com/questions/18614301/keep-overflow-div-scrolled-to-bottom-unless-user-scrolls-up
StatusBar.prototype.scroll_to_bottom = function() {
	var my = this;
	my.statusbar_content[0].scrollTop = my.statusbar_content[0].scrollHeight;
};

StatusBar.prototype.toggle_min = function() {
	var my = this;
	if( my.statusbar.hasClass( "minimized" ) ) {
		my.statusbar.removeClass( "minimized" );
	} else {
		my.hide();
	}
};

StatusBar.prototype.toggle_max = function() {
	var my = this;
	if( my.statusbar.hasClass( "maximized" ) ) {
		my.statusbar.removeClass( "maximized" );
	} else {
		my.maximize();
	}
};

StatusBar.prototype.show = function() {
	var my = this;
	my.statusbar.removeClass( "minimized" );
};

StatusBar.prototype.maximize = function() {
	var my = this;
	my.statusbar.removeClass( "minimized" ).addClass( "maximized" );
};

StatusBar.prototype.hide = function() {
	var my = this;
	my.statusbar.removeClass("maximized").addClass( "minimized" );
};

return StatusBar;
}); //define()

