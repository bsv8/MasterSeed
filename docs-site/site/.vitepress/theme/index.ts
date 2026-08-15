import DefaultTheme from 'vitepress/theme';
import MasterSeedHome from './MasterSeedHome.vue';
import './custom.css';
export default {extends: DefaultTheme, enhanceApp({app}) {app.component('MasterSeedHome', MasterSeedHome);}};
