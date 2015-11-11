/*
 * Jordan Farrer <jordan@1strategy.com>, 1Strategy
 *
 * This Lambda function will be executed after an SNS message
 * is posted with details from AWS Config on what changed.
 *
 * Prerequisites/Setup
 * - An SNS topic should be created to receive messages from AWS Config
 * - AWS Config should be turned on and sending changes to the newly created SNS topic
 * - IAM Execution Role assigned to this function should be able to send email from SES
 * - "fromAddress" variable should be set to the email address notifications should be sent from (must be supported by SES)
 * - Lambda function should be subscribed to AWS Config SNS topic
 *
 */

var fromAddress = "";

var aws = require('aws-sdk');
var ses = new aws.SES({ apiVersion: '2010-12-01' });

exports.handler = function (event, context) {
    // Validate the incoming event
    if (!event.Records
        || event.Records.length == 0
        || !event.Records[0].Sns
        || !event.Records[0].Sns.Message) {
        context.done();
        return;
    }

    // The "message" from the event is stringified - it needs to be parsed into an object
    var message = JSON.parse(event.Records[0].Sns.Message);

    // Validate the format of the SNS message
    if (!message || !message.configurationItemDiff || !message.configurationItem) {
        console.log("The 'message' format is invalid. Stopping execution...")
        context.done();
        return;
    }

    // Make sure the change notification is for a Security Group
    if (message.configurationItem.resourceType !== 'AWS::EC2::SecurityGroup') {
        console.log('Change notifications are only supported for Security Groups.');
        context.done();
        return;
    }

    // Check to make sure notifications are enabled for this SG
    var notifyOnChange = message.configurationItem.tags["NotifyOnChange"];

    if (!notifyOnChange || notifyOnChange == 'No' || notifyOnChange == 'False') {
        console.log('Notifications are not enabled for the Security Group in question.');
        context.done();
        return;
    }

    // Retrieve tags that need to be included in email body
    var owner = message.configurationItem.tags["Owner"];
    var ownerDL = message.configurationItem.tags["OwnerDL"];
    var securityGroupId = message.configurationItem.resourceId;
    var securityGroupName = message.configurationItem.tags["Name"];

    // Verify email address in the OwnerDL tag is a valid email address
    var emailRegex = /([\w-\+\.]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)/i;
    if (!ownerDL || ownerDL === '' || !emailRegex.test(ownerDL)) {
        console.log('The email address provided in the OwnerDL tag is either missing or invalid.');
        context.done();
        return;
    }

    console.log("Owner: " + owner);
    console.log("Owner DL: " + ownerDL);
    console.log("Security Group ID: " + securityGroupId);

    var sgIdentifiers = [securityGroupId];
    if (securityGroupName && securityGroupName != '') {
        sgIdentifiers.push(securityGroupName);
    }

    // Construct the subject line
    var subject = "Security Group " + securityGroupId + " Was Changed"

    // Construct the email body (simple right now)
    var emailMessage = 'The security group ' + sgIdentifiers.join('/') + ' was changed.\n\nDetails:\n';
    emailMessage += JSON.stringify(message.configurationItemDiff, null, 2);

    console.log("Email Body: " + emailMessage);

    // Send the notification email and end function on callback
    sendEmail(ownerDL, subject, emailMessage, function () {
        context.done(null, { success: true });  // SUCCESS with message
    });
};

function sendEmail(toAddress, subject, message, callback) {
    // Contruct the parameters for the email
    var emailParams = {
        Destination: {
            ToAddresses: [toAddress]
        },
        Message: {
            Body: {
                Text: {
                    Data: message
                }
            },
            Subject: {
                Data: subject
            }
        },
        Source: fromAddress
    };

    // Send the email using the parameters
    var email = ses.sendEmail(emailParams, function (err, data) {
        if (err) {
            console.log('Error: ' + err);
            throw new Error(err);
        }
        else {
            console.log('Email sent successfully.');
        }
        callback();
    });
}
