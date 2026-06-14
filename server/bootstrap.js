const { join } = require('path');

// 加载环境变量
require('dotenv').config({ path: join(__dirname, '.env') });

const { Bootstrap } = require('@midwayjs/bootstrap');

Bootstrap
  .configure({
    appDir: __dirname,
  })
  .run();
