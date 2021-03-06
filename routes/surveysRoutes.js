const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireLogin = require('../middlewares/requireLogin');
const requireCredits = require('../middlewares/requireCredits');
const keys = require('../config/keys');

const Survey = mongoose.model('surveys');

// mailGun Config
const mailgun = require('mailgun-js');

const mg = mailgun({
  apiKey: keys.mailGunApiKey,
  domain: keys.MailGunDomain,
});

router.post('/api/surveys/webhook', (req, res) => {
  // get the data out of reqeust body
  const email = req.body['event-data'].recipient;
  const url = req.body['event-data'].url;
  const urlParts = url.split('/');
  const surveyId = urlParts[5];
  const choice = urlParts[6];

  console.log(email, surveyId, choice);

  // find and update survey

  Survey.updateOne(
    {
      _id: surveyId,
      recipients: {
        $elemMatch: { email, responded: false },
      },
    },
    {
      $inc: { [choice]: 1 },
      $set: { 'recipients.$.responded': true },
      lastResponse: new Date(),
    }
  ).exec();

  // respond to request
  res.send({});
});

router.post('/api/surveys', requireLogin, requireCredits, async (req, res) => {
  const { title, subject, body, emails } = req.body;

  // Create Survey
  const survey = new Survey({
    title,
    subject,
    body,
    recipients: emails.split(',').map((email) => ({ email: email.trim() })),
    _user: req.user,
    dataSent: Date.now(),
  });

  // create the message and send it

  const data = {
    from: 'Emaily <no-replay@emaily.com>',
    to: emails,
    subject: subject,
    html: `
      <div style='text-align:center'>
        <h3> I'd Like Your Input </h3>
        <p> Please Answer The Following Question</p>
        <p> ${body} </p>
        <div>
        <a href="${keys.redirectDomain}surveys/thanks/${survey.id}/yes"> Yes </a> 
        </div>
        <div>
        <a href="${keys.redirectDomain}surveys/thanks/${survey.id}/no"> No </a>
        </div>
      </div>
    `,
  };

  //Deduct user credits by one
  req.user.credits--;

  // Send Email and Save Survey and User
  try {
    const user = await req.user.save();
    await survey.save();
    mg.messages().send(data, (error, body) => {
      console.log(body);
    });
  } catch (error) {
    res.status(422).send(error);
  }

  // Send response
  res.send(req.user);
});

router.get('/api/surveys', requireLogin, async (req, res) => {
  const surveys = await Survey.find({ _user: req.user }).select({
    recipients: false,
  });
  res.send(surveys);
});

// Delete A Survey
router.post('/api/surveys/delete', requireLogin, async (req, res) => {
  const { id } = req.body;
  try {
    await Survey.deleteOne({ _id: id, _user: req.user });
    res.send({ result: 'Deleted' });
  } catch (error) {
    res.send(error);
  }
});

module.exports = router;
