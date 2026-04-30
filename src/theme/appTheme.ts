import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const appTheme = definePreset(Aura, {
	semantic: {
		primary: {
			50: '#e8eef8',
			100: '#c9d6ee',
			200: '#9bb2e0',
			300: '#6d8ed2',
			400: '#4a71c7',
			500: '#14387f', // rgb(20,56,127)
			600: '#123373',
			700: '#0f2c63',
			800: '#0c2553',
			900: '#081c3d'
		},
		colorScheme: {
			light: {
				primary: {
					color: '{primary.500}',
					inverseColor: '#ffffff',
					hoverColor: '{primary.600}',
					activeColor: '{primary.700}'
				},
				highlight: {
					background: '{primary.500}',
					color: '#ffffff',
					focusBackground: '{primary.600}',
					focusColor: '#ffffff'
				}
			}
		}
	},
	components: {
        card: {
            colorScheme: {
                light: {
                    root: {
						shadow: '2px 3px 4px 1px {content.border.color}'
                    },
                    subtitle: {
                        color: '{surface.800}'
                    }
                }
            }
        },
		chip:{
			colorScheme:{
				light: {
					root: {
						borderRadius: '9999px'
					}
				}
			}
		},
		autocomplete: {
			chip: {
				borderRadius: '9999px'
			}
		}

    },
	extend: {
		app: {
			sidebar: {
				background:
					'linear-gradient(356.83deg, rgb(2, 27, 44) 29.54%, rgb(20, 56, 127) 92.36%)',
				text: 'rgba(255,255,255,0.85)',
				textMuted: 'rgba(222,222,222,0.65)'
			},
			main: {
				background:
					'linear-gradient(150deg, rgb(232, 243, 255) 24%, rgb(207, 228, 255) 92%)'
			},
			highlight: {
				category: {
					background: '{sky.100}',
					color: '{sky.800}'
				},
				concern: {
					background: '{orange.100}',
					color: '{orange.800}'
				}
			}
		}
	}
});
