/*

	Bidirectional eventloop extension for Electron IPC API
	~ Arty (www.itzarty.eu)

*/

const { performance } = require( 'perf_hooks' );

class IPC {
	constructor( receiver, sender, events, errorCallback ) {
		this.receiver = receiver;
		this.sender = sender;
		this.events = events;
		this.errorCallback = errorCallback || ( ()=>{} );
		this.callbacks = { };

		this.receiver.on( 'call', ( _, eventName, data, callbackKeys, callbackId ) => {
			const event = events[ eventName ];
			if( !event ) return;
			
			for( const key of callbackKeys ) {
				data[ key ] = this.composeCallback( data[ key ] );
			}
			const callback = this.composeCallback( callbackId );
			event( data, callback );
		} );

		this.receiver.on( 'callback', async ( _, id, args, mappings ) => {
			const callback = this.callbacks[ id ];
			if( !callback ) return;
			for( const map of mappings ) {
				if ( map.key ) {
					args[ map.index ][ map.key ] = this.composeCallback( args[ map.index ][ map.key ] );
				} else {
					args[ map.index ] = this.composeCallback( args[ map.index ] );
				}
			}
			callback( ... args );
		} );
	}

	send = ( event, data ) => new Promise( resolve => {
		const callbackKeys = [ ];
		const callbackId = this.registerCallback( ( error, answer ) => {
			if( error && error !== true ) { 
				this.errorCallback( error );
				resolve( false );
				return;
			}
			resolve( answer );
		} );
		for( const key in data ) {
			if( typeof data[ key ] == 'function' ) {
				data[ key ] = this.registerCallback( data[ key ] );
				callbackKeys.push( key );
			}
		}
		this.sender.send( 'call', event, data, callbackKeys, callbackId );
	} )

	composeCallback = id => {
		const scope = this;
		return function( ) {
			const args = [ ... arguments ];
			const mappings = [ ]; 
			for( let i = 0; i < args.length; i++ ) {
				const arg = args[ i ];
				if( typeof arg == 'function' ) {
					args[ i ] = scope.registerCallback( arg );
					mappings.push( { index: i, key: null } );
				} else if( typeof arg == 'object' && arg !== null ) {
					for( const key in arg ) {
						if( typeof arg[ key ] == 'function' ) {
							arg[ key ] = scope.registerCallback( arg[ key ] );
							mappings.push( { index: i, key: key } );
						}
					}
				}
			}
			scope.sender.send( 'callback', id, args, mappings );
		}
	}

	registerCallback = fn => {
		const id = performance.now() + Math.random(); 
		this.callbacks[ id ] = fn;
		return id;
	}
}

module.exports = IPC;