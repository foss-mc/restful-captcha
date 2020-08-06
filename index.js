const SITE_KEY = process.env.SITE_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const CAPTCHA_TYPE = process.env.CAPTCHA_TYPE;

const express = require('express');
const path = require('path');
const PORT = process.env.PORT || 5000;

const NodeCache = require('node-cache');
const idCache = new NodeCache( { stdTTL: 100, checkperiod: 120 } );

const app = express()
  .use(express.json())
  .use(express.urlencoded({ extended: true }))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .get('/q/:id', (req, res) => res.send(idCache.has(req.params.id)));

let captchaRender;
let captchaVerify;
let isVerifySucceed;

if (CAPTCHA_TYPE == 'reCaptcha-v3') {
  const Recaptcha = require('express-recaptcha').RecaptchaV3;
  const recaptcha = new Recaptcha(SITE_KEY, SECRET_KEY, {callback:'cb'});

  app
    .get('/v/:id', recaptcha.middleware.render, (req, res) => res.render('pages/recaptcha-v3', { captcha: res.recaptcha, id: req.params.id }));
  captchaVerify = recaptcha.middleware.verify;
  isVerifySucceed = (req) => !req.recaptcha.error;
} else if (CAPTCHA_TYPE == 'hCaptcha') {
  const hcaptcha = require('hcaptcha.js');

  // https://docs.hcaptcha.com/
  app
    .get('/v/:id', (req, res) => res.render('pages/hcaptcha', {
      captchaScript: '<script src="https://hcaptcha.com/1/api.js" async defer></script>',
      captchaDiv: `<div class="h-captcha" data-sitekey="${SITE_KEY}"></div>`,
      id: req.params.id
    }));
  captchaVerify = hcaptcha.middleware.validate(SECRET_KEY);
  isVerifySucceed = (req) => !!req.hcaptcha;
} else {
  throw `Unknown CAPTCHA_TYPE ${CAPTCHA_TYPE}`;
}

const rateLimit = require('express-rate-limit');
const verifyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: "Too many verification from this IP, please try again later"
  });

app
  // Only this generally takes tens of milliseconds. Others can generally be completed within a few milliseconds.
  .post('/done', verifyRateLimiter, captchaVerify, (req, res) => {
    const id = req.body.id
    if (isVerifySucceed(req)) {
      idCache.set(id, true)
      res.render('pages/done', { id: id })
    } else {
      res.render('pages/failed', { id: id })
    }
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));
