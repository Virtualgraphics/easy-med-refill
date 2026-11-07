import common from './common';
import dashboard from './dashboard';
import medication from './medication';
import scan from './scan';
import orders from './orders';
import settings from './settings';

/** English is the reference catalogue; its shape types every other language. */
const en = { common, dashboard, medication, scan, orders, settings };

export default en;
