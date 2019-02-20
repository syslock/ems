// FIXME: module encapsulation:
var AudioItem = null;

define(["jquery","item","video_variant"], function($,BaseItem,MediaVariant) {
	
	AudioItem = function( parms ) {
		parms = parms ? parms : {};
		BaseItem.call( this, parms );
	};
	AudioItem.prototype = Object.create( BaseItem.prototype );
	AudioItem.prototype.constructor = AudioItem;
	
	AudioItem.prototype.init = function() {
		if( this.template==undefined ) {
			// FIXME: We should try to do only one request for the template,
			//        even if a bunch of objects are initiated the same time,
			//        e.g. at initial page load.
			GlobalRequestQueue.add({
				module : "render",
				args : {tpl : "elements/audio.html"},
				done : function(result) {
					AudioItem.prototype.template = result;
					this.init();
				}.bind(this),
				fail : function(result) {
					parse_result( result );
				}.bind(this)
			});
			GlobalRequestQueue.process();
		} else {
			BaseItem.prototype.init.call( this );
			this.box = $( ".audio-box", this.dom_object );
			this.audio = $( ".audio", this.dom_object );
			this.dom_player = this.audio[0];
			this.dom_player.preload="metadata";
			this.status = $( ".audio-status", this.dom_object );
			this.status_image = $( ".audio-status-image", this.status );
			this.status_text = $( ".audio-status-text", this.status );
			this.dom_player.addEventListener( 'canplay', function(event) {
				this.status.hide();
			}.bind(this) );
			this.variants_element = $( ".media-variants", this.dom_object );
			this.variant_items = [];
			
			this.dom_player.onplay = function() { this.status.hide(); }.bind(this);
		
			// quick lookup of already available variants:
			GlobalRequestQueue.add( {
				module : "convert",
				args : {mode : "status", id : this.obj.id, view : "all"},
				done : this.conversion_callback.bind(this)
			} );
			GlobalRequestQueue.process();
		}
	};
	
	AudioItem.prototype.identification_callback = function( raw_result ) {
		var result = parse_result( raw_result );
		if( result.succeeded ) {
			this.variants_element.empty();
			this.variant_items.splice([]);
			for( var i=0; i < result.objects.length; i++ ) {
				var obj = result.objects[i];
				
				var variant_item = new MediaVariant( {obj:obj, dom_parent:this.variants_element, duplicates:true, parent:this, 
					item_ready: function(item) {
						this.variant_items.push( item );
						if( this.selected_variant ) {
							this.select_variant( this.selected_variant );
						}
					}.bind(this)
				});
			}
		}
	};
	
	AudioItem.prototype.select_variant = function( variant_item ) {
		this.selected_variant = variant_item;
		for( var i=0; i<this.variant_items.length; i++ ) {
			var item = this.variant_items[i];
			item.update_selection_state( this.selected_variant );
		}
		this.dom_player.src = get_module_url( "get", {id: this.selected_variant.obj.id, view: "data"} );
	};
	
	AudioItem.prototype.conversion_callback = function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			var stale_source_count = 0;
			var ready_source_count = 0;
			var identification_request_list = [ this.obj.id ];
			this.status_text.empty();
			for( var i=0; result.substitutes.length && i<result.substitutes.length; i++ ) {
				var substitute = result.substitutes[i];
				var conv_obj = substitute.substitute_object[0];
				if( conv_obj.type.match('^audio/.*') ) {
					if( conv_obj.size>0 ) {
						this.status_text.append( $('<div>').attr({class: 'audio-status-success'}).text(conv_obj.type+": OK") );
						ready_source_count++;
						// use first compatible audio source:
						if( !this.dom_player.src && this.dom_player.canPlayType(conv_obj.type) ) {
							this.select_variant( {obj: {id: conv_obj.id}} );
						}
						identification_request_list.push( conv_obj.id );
					} else {
						this.status_text.append( $('<div>').attr({class: 'audio-status-warning'}).text(conv_obj.type+": processing") );
						stale_source_count++;
					}
				}
			}
			GlobalRequestQueue.add( {
				module : "identify",
				args : {id : identification_request_list.join(",")},
				done : this.identification_callback.bind(this)
			});
			GlobalRequestQueue.process();
			
			// use original audio source as a fallback if compatible:
			if( !this.dom_player.src && this.dom_player.canPlayType(this.obj.type) ) {
				this.select_variant( {obj: {id: this.obj.id}} );
			}
			
			if( ready_source_count+stale_source_count==0 ) {
				// queue long conversion request for missing variants:
				/*GlobalRequestQueue.add( {
					module : "convert",
					args : {mode : "convert", id : this.obj.id, view : "all"},
					done : this.conversion_callback.bind(this)
				}, "long" );
				GlobalRequestQueue.process();*/
			} else if( stale_source_count==0 ) {
				this.status.hide();
			}
			if( !this.dom_player.src ) {
				window.setTimeout( function() {
					// repeat variant lookup after a few seconds, until compatible source is found:
					GlobalRequestQueue.add( {
						module : "convert",
						args : {mode : "status", id : this.obj.id, view : "all"},
						done : this.conversion_callback.bind(this)
					} );
					GlobalRequestQueue.process();
				}.bind(this), 5000 );
			}
		}
	};

	return AudioItem;
}); //define()
