module.exports = {
  content: ['./src/**/*.{tsx,ts}', './public/index.html'],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms')],
};
