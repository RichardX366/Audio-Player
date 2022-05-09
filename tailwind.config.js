const colors = require('tailwindcss/colors');

module.exports = {
  content: ['./src/**/*.{tsx,ts}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        THEME: colors.sky,
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
