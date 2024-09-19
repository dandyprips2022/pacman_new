var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var Database = require('../lib/database');
const { trace } = require('@opentelemetry/api');

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })

// middleware that is specific to this router
router.use(function timeLog (req, res, next) {
    console.log('Time: ', Date());
    next();
})

router.get('/list', urlencodedParser, function(req, res, next) {
    console.log('[GET /highscores/list]');
    Database.getDb(req.app, function(err, db) {
        if (err) {
            return next(err);
        }

        // Retrieve the top 10 high scores
        var col = db.collection('highscore');
        col.find({}).sort([['score', -1]]).limit(10).toArray(function(err, docs) {
            var result = [];
            if (err) {
                console.log(err);
            }

            docs.forEach(function(item, index, array) {
                result.push({ name: item['name'], cloud: item['cloud'],
                              zone: item['zone'], host: item['host'],
                              score: item['score'] });
            });

            res.json(result);
        });
    });
});

// Accessed at /highscores
router.post('/', urlencodedParser, function(req, res, next) {
    // Create a tracer instance
    const tracer = trace.getTracer('default');
    
    // Start a new span for the POST request
    const span = tracer.startSpan('Manually Instrumented POST /highscores');
    span.setAttribute('instrumented.by', 'Priyanshu')
    span.setAttribute('http.method', 'POST')

    try {
        console.log('[POST /highscores] body =', req.body,
                    ' host =', req.headers.host,
                    ' user-agent =', req.headers['user-agent'],
                    ' referer =', req.headers.referer);

        var userScore = parseInt(req.body.score, 10),
            userLevel = parseInt(req.body.level, 10);

        Database.getDb(req.app, function(err, db) {
            if (err) {
                span.setStatus({ code: 2 }); // 2 = ERROR
                span.end();
                console.error('Unexpected error:', err);
                // Throw an actual JavaScript error
                return next(new Error('Failed to connect to the database.'));
            }

            // Insert high score with extra user data
            db.collection('highscore').insertOne({
                    name: req.body.name,
                    cloud: req.body.cloud,
                    zone: req.body.zone,
                    host: req.body.host,
                    score: userScore,
                    level: userLevel,
                    date: Date(),
                    referer: req.headers.referer,
                    user_agent: req.headers['user-agent'],
                    hostname: req.hostname,
                    ip_addr: req.ip
                }, {
                    w: 'majority',
                    j: true,
                    wtimeout: 10000
                }, function(err, result) {
                    span.end(); // End the span after the operation is complete
                    var returnStatus = '';

                    if (err) {
                        console.log(err);
                        returnStatus = 'error';
                    } else {
                        console.log('Successfully inserted highscore');
                        returnStatus = 'success';
                    }

                    res.json({
                        name: req.body.name,
                        zone: req.body.zone,
                        score: userScore,
                        level: userLevel,
                        rs: returnStatus
                    });
                });
        });
    } catch (error) {
        span.setStatus({ code: 2 }); // 2 = ERROR
        span.recordException(error);
        span.end();
        next(error);
    }
});

module.exports = router;
