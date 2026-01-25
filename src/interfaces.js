const pty = require( 'node-pty' );
const { Client } = require( 'ssh2' );
const { Telnet } = require( 'telnet-client' );
const { SerialPort } = require( 'serialport' );

const psTree = require( 'ps-tree' );

const IShell = ( { write, exit, ready }, { file, cwd, shell } ) => {
    const ptyProcess = pty.spawn( shell, file ? [ file ] : [ ], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.env.HOME
    } );

    ptyProcess.onData( write );
    ptyProcess.onExit( exit );

    ready( );

    return {
        write: data => ptyProcess.write( data ),
        kill: async ( force, callback ) => {
            if( force ) {
                ptyProcess.kill( );
                return;
            }

            psTree( ptyProcess.pid, ( error, children ) => {
                if( children.length > 0 ) {
                    if( callback ) callback( false );
                    return;
                }

                if( callback ) callback( true );
                ptyProcess.kill( );
            } );
        },
        resize: ( cols, rows ) => ptyProcess.resize( cols, rows )
    }
}

const ISerial = ( { write, exit, ready }, { path, baudRate } ) => {
    const port = new SerialPort( { path, baudRate } );

    const decoder = new TextDecoder( );

    port.on( 'data', data => {
        const decoded = decoder.decode( data );
        write( decoded );
    } );

    port.on( 'close', exit );
    port.on( 'error', exit );

    ready( );

    return {
        write: data => port.write( data ),
        kill: ( force, callback ) => {
            port.close( );
            if( callback ) callback( true );
        },
        resize: ( ) => { }
    }
}

const ISSH = ( { write, exit, ready, announce }, options ) => new Promise( resolve => {
    const connection = new Client( );

    connection.on( 'ready', ( ) => {
        connection.shell( {
            term: 'xterm-color',
            cols: 80,
            rows: 24
        }, ( error, stream ) => {
            if( error ) {
                exit( error );
                return;
            }
            let connected = true;
            const end = reason => {
                if( !connected ) return;
                connected = false;
                exit( reason );
            }

            stream.on( 'data', data => write( data ) );
            stream.on( 'close', end );
            connection.on( 'close', end );

            ready( );

            // Latency detection
            connection.exec( 'cat', ( error, stream ) => {
                const loop = ( ) => {
                    if( !connected ) {
                        stream.end( );
                        return;
                    }
                    let start;
                    stream.once( 'data', ( ) => {
                        announce( 'Latency', `${ Date.now( ) - start }ms` );
                    } );
                    start = Date.now( );
                    stream.write( '\n' );
                    setTimeout( loop, 2000 );
                }
                loop( );
            } );

            resolve( {
                write: data => stream.write( data ),
                kill: ( force, callback ) => {
                    connection.end( );
                    if( callback ) callback( true );
                },
                resize: ( cols, rows ) => stream.setWindow( rows, cols )
            } );
        } );
    } );

    connection.on( 'error', exit );
    connection.connect( options );
} );

const ITelnet = ( { write, exit, ready }, options ) => {
    const connection = new Telnet( );

    connection.on( 'data', write );
    connection.on( 'error', exit );
    connection.connect( options );

    ready( );

    return {
        write: data => connection.send( data ),
        kill: ( force, callback ) => {
            connection.destroy( );
            if( callback ) callback( true );
        },
        resize: ( ) => { }
    }
}

const Modules = {
    shell: IShell,
    serial: ISerial,
    telnet: ITelnet,
    ssh: ISSH
}

module.exports = ( config, options ) => {
    const mod = Modules[ config.mode ];
    if( !mod ) {
        console.error( 'Unknown interface mode' );
        return;
    }
    return mod( config, options );
}