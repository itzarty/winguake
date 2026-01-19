( async ( ) => {

    const {
        app,
        BrowserWindow,
        screen,
        ipcMain,
        Tray,
        Menu,
        nativeImage,
        dialog
    } = require( 'electron' );
    const path = require( 'path' );
    const AutoLaunch = require( 'auto-launch' );
    const { SerialPort } = require( 'serialport' );
    const { UiohookKey } = require( 'uiohook-napi' );

    const IPC = require( './web/ipc.js' );
    const Shortcuts = require( './src/shortcuts.js' );
    const Interface = require( './src/interfaces.js' );

    await app.whenReady( );

	const singleInstance = app.requestSingleInstanceLock( );
	if( !singleInstance ) {
		app.quit( );
		return;
	}

    const info = {
        version: app.getVersion( ),
        release: app.isPackaged
    }

    let autoLaunch;
    if( info.release ) {
        autoLaunch = new AutoLaunch( {
            name: 'WinGuake',
            path: app.getPath( 'exe' )
        } );
    }

    const window = new BrowserWindow( {
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true
        },
        frame: false,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        show: false,
        skipTaskbar: true,
        transparent: true
    } );

    const icon = nativeImage.createFromPath( path.join( __dirname, 'icon.png' ) );
    const tray = new Tray( icon );
    tray.setToolTip( 'WinGuake' );
    const contextMenu = Menu.buildFromTemplate( [
        {
            label: 'WinGauke',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            label: 'Quit',
            click: ( ) => quit( )
        }
    ] );
    tray.setContextMenu( contextMenu );

    const instances = { };

    const quit = ( ) => {
        window.hide( );
        for( const instance of Object.values( instances ) ) {
            try {
                instance.kill( );
            } catch( error ) {
                console.error( 'Could not kill a running PTY', error );
            }
        }
        window.close( );
    }

    window.loadFile( 'web/index.html' );

    let multipliers = { x: 0, y: 0, height: 0.5, width: 1 }

    const show = ( ) => {
        const cursor = screen.getCursorScreenPoint( );
        const display = screen.getDisplayNearestPoint( cursor );

        const { x, y, width, height } = display.workArea;

        window.setBounds( {
            x: x + ( width * multipliers.x ),
            y: y + ( height * multipliers.y ),
            width: width * multipliers.width,
            height: height * multipliers.height
        } );

        window.setSize( Math.floor( width * multipliers.width ), Math.floor( height * multipliers.height ) );

        window.show( );
    }

    window.on( 'show', ( ) => window.focus( ) );

    const toggle = ( ) => {
        if( window.isVisible( ) ) {
            window.hide( );
            return;
        }
        show( );
    }

    let maximized = false;

    const switches = {
        '-t': toggle,
        '-s': show,
        '-h': window.hide
    }

    app.on( 'second-instance', ( event, argv ) => {
        for( const arg of argv ) {
            const sw = switches[ arg ];
            if( sw ) sw( );
        }

        const target = argv.at( -1 );
        send( 'instance', target );
        show( );
    } );

    let resizeEnable = false;
    const resizeLoop = direction => {
        if( !resizeEnable ) return;

        const position = screen.getCursorScreenPoint( );
        const bounding = window.getBounds( );

        switch( direction ) {
            case 'top':
                bounding.height += bounding.y - position.y;
                bounding.y = position.y;
                break;
            case 'bottom':
                bounding.height = position.y - bounding.y;
                break;
            case 'left':
                bounding.width += bounding.x - position.x;
                bounding.x = position.x;
                break;
            case 'right':
                bounding.width = position.x - bounding.x;
                break;
        }

        window.setBounds( bounding );

        const display = screen.getDisplayNearestPoint( bounding );

        multipliers = {
            x: ( bounding.x - display.bounds.x ) / display.bounds.width,
            y: ( bounding.y - display.bounds.y ) / display.bounds.height,
            width: bounding.width / display.bounds.width,
            height: bounding.height / display.bounds.height
        }

        setTimeout( ( ) => resizeLoop( direction ), 10 );
    }

    const binds = {
        kill: {
            combination: [ ],
            up: ( ) => send( 'kill' )
        },
        ghost: {
            combination: [ ],
            down: ( ) => {
                window.setIgnoreMouseEvents( true );
                send( 'ghost', true )
            },
            up: ( ) => {
                window.setIgnoreMouseEvents( false );
                send( 'ghost', false );
                window.focus( );
            }
        },
        toggle: {
            combination: [ ],
            up: toggle
        },
        instance: {
            combination: [ ],
            up: ( ) => send( 'instance' )
        },
        max: {
            combination: [ ],
            up: ( ) => {
                if( !window.isFocused( ) ) return;
                maximized = !maximized;
                if( !maximized ) {
                    show( );
                    return;
                }
                window.maximize( );
            }
        },
        devTools: {
            combination: [ UiohookKey.F6 ],
            up: ( ) => {
                if( !info.release )
                window.toggleDevTools( )
            }
        },
        reload: {
            combination: [ UiohookKey.F5 ],
            up: ( ) => {
                if( !info.release )
                window.reload( )
            }
        }
    }

    const { send } = new IPC( ipcMain, window.webContents, {
        initialize: async ( _, answer ) => answer( null, info ),
        bounding: boundings => multipliers = boundings,
        selectDirectory: async ( _, answer ) => {
            const result = await dialog.showOpenDialog( window, {
                properties: [ 'openDirectory' ]
            } );
            const [ directory ] = result.filePaths;
            answer( null, directory );
        },
        selectFile: async ( _, answer ) => {
            const result = await dialog.showOpenDialog( window, {
                properties: [ 'openFile' ]
            } );
            const [ file ] = result.filePaths;
            answer( null, file );
        },
        resizeWindow: ( { state, direction } ) => {
            resizeEnable = state;
            if( resizeEnable ) {
                resizeLoop( direction );
                return;
            }
            send( 'bounding', multipliers );
        },
        kill: id => {
            const instance = instances[ id ];
            if( !instance ) return;
            instance.kill( );
        },
        resize: ( { cols, rows } ) => {
            for( const instance of Object.values( instances ) ) {
                instance.resize( cols, rows );
            }
        },
        bell: ( ) => process.stdout.write( '\u0007' ),
        bind: ( { name, combination } ) => {
            if( !binds[ name ] ) return;
            binds[ name ].combination = combination.replaceAll( 'Control', 'Ctrl' ).split( '+' ).map( str => UiohookKey[ str ] );
        },
        presetBind: ( { combination, callback, id } ) => {
            binds[ id ] = {
                combination: combination.replaceAll( 'Control', 'Ctrl' ).split( '+' ).map( str => UiohookKey[ str ] ),
                up: ( ) => callback( )
            }
        },
        autoLaunch: async ( _, answer ) => {
            if( !app.isPackaged ) {
                answer( false );
                return;
            }

            answer( await autoLaunch.isEnabled( ) );
        },
        toggleAutoLaunch: async ( _, answer ) => {
            if( !app.isPackaged ) {
                answer( false );
                return;
            }

            const enabled = await autoLaunch.isEnabled( );
            if( enabled ) {
                await autoLaunch.disable( );
            } else {
                await autoLaunch.enable( );
            }

            answer( !enabled );
        },
        instance: async ( { id, mode, options, write, exit }, answer ) => {
            try {
                const interface = await Interface( {
                    mode,
                    write,
                    exit: reason => {
                        delete instances[ id ];
                        exit( reason );
                    }
                }, options );

                instances[ id ] = interface;

                answer( true, { ... interface } );
            } catch( error ) {
                exit( );
            }
            show( );
        },
        serialDevices: async ( _, answer ) => {
            const devices = await SerialPort.list( );
            answer( null, devices );
        }
    }, console.error );

    Shortcuts( binds );

} )( );