var Confirm = {
	count: 0,
	confirm: function( parms ) {
		var dialog = $('#confirm-dialog-template').first().clone()[0];
		dialog.id = 'confirm-dialog-'+(this.count++);
		$('.confirm-message', dialog).text( parms.message );
		if( parms.before ) {
			$(parms.before).before( dialog );
		} else if( parms.after ) {
			$(parms.after).after( dialog );
		}
		dialog.style.display = '';
		$(dialog).data( {	ok_callback: parms.ok_callback, 
							ok_parms: parms.ok_parms,
							cancel_callback: parms.cancel_callback,
							cancel_parms: parms.cancel_callback
		} );
	},
	
	ok: function( dialog ) {
		if( $(dialog).data().ok_callback ) {
			$(dialog).data().ok_callback( $(dialog).data().ok_parms );
		}
		$(dialog).remove();
	},
	
	cancel: function( dialog ) {
		if( $(dialog).data().cancel_callback ) {
			$(dialog).data().cancel_callback( $(dialog).data().cancel_parms );
		}
		$(dialog).remove();
	}
};
