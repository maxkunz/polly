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
		},
		// Barrierefreiheit (WCAG AA, Kontrast ≥ 4.5:1): Aura nutzt für farbige Buttons
		// und Messages zu helle Töne, daher hier jeweils 1–2 Stufen dunkler.
		button: {
			colorScheme: {
				light: {
					root: {
						info: {
							background: '{sky.700}', hoverBackground: '{sky.800}', activeBackground: '{sky.900}',
							borderColor: '{sky.700}', hoverBorderColor: '{sky.800}', activeBorderColor: '{sky.900}'
						},
						success: {
							background: '{green.700}', hoverBackground: '{green.800}', activeBackground: '{green.900}',
							borderColor: '{green.700}', hoverBorderColor: '{green.800}', activeBorderColor: '{green.900}'
						},
						warn: {
							background: '{orange.700}', hoverBackground: '{orange.800}', activeBackground: '{orange.900}',
							borderColor: '{orange.700}', hoverBorderColor: '{orange.800}', activeBorderColor: '{orange.900}'
						},
						danger: {
							background: '{red.600}', hoverBackground: '{red.700}', activeBackground: '{red.800}',
							borderColor: '{red.600}', hoverBorderColor: '{red.700}', activeBorderColor: '{red.800}'
						}
					},
					outlined: {
						secondary: { color: '{surface.600}' },
						danger: { color: '{red.600}' }
					},
					text: {
						secondary: { color: '{surface.600}' },
						danger: { color: '{red.600}' }
					}
				}
			}
		},
		message: {
			colorScheme: {
				light: {
					info: { color: '{blue.700}' },
					success: { color: '{green.700}' },
					warn: { color: '{yellow.800}' },
					error: { color: '{red.700}' }
				}
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
