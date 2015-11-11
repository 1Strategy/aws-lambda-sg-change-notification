# Security Group Change Notifications

## Overview

The purpose of this project is to provide a mechanism for notifying 
owners of Security Groups that changes have been made. In its current 
state, the solution will only notify that a change has been made and 
output JSON detailing the change that was made (as provided by AWS Config).

This solution depends on AWS Config to keep track of changes on resources. 
AWS Config provides an option to publish a message to an SNS topic when changes 
are detected for tracked resources. A Lambda function subscribes to the SNS topic
provided to AWS Config, and effectively filters SNS messages to those that are
Security Group changes. When the Lamda is executed, it looks for a NotifyOnChange tag
which denotes that changes should trigger notificiations and an "OwnerDL" tag which 
specifies who should receive the change notification.

## Roadmap/Future Enhancements

- Improve error catching in email sending logic
- Improve change detail message (requires parsing JSON of item diff)
- HTML Body instead of just text

## Security Group Tagging Requirements

**NotifyOnChange** - switch to determine if notifications should be sent when changes
are detected
<br/>
Acceptable Values: "Yes", "No"

**OwnerDL** - the distribution list/email belonging to the owner of the security group.
The value of this tag is where notifications are sent.
<br />
Acceptable Values: valid email address

## SNS

A topic needs to exist that can receive messages when changes are detected by
AWS Config. If there is already a topic created with that responsibility, a new 
subscription to that topic will need to be created. Else, a new topic needs to be 
created.

## SES

In order to send emails from the Lambda function, SES must be setup in the account
with either a verified sender, or verified domain. The "from" email address must be
able to be handled by SES in order for the email to be sent successfully.

## Lambda Function

### Lambda Execution Role

The Lambda function must be able to:

- Write to CloudWatch Logs
- Send email through SES

Below is an example policy for a Lambda Execution Role that would grant the
necessary permissions:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

### Source Code

The code for the Lambda Function can be found in app.js. This file consists of
a handler (exports.handler) and a helper function for sending email through
SES. There are also no additional dependencies beyond the aws-sdk.

The handler does several checks to ensure that the SNS message being received
is in an expected format. The security group is checked for the required
tags (NotifyOnChange and OwnerDL) with some validation on the values of each
tag. If the tags are valid and indicate that a notification should be sent, the
subject line and body of the email are constructed. The subject and body are
then passed to a helper method which will send an email to the provided
recipient (OwnerDL tag value) detailing the change that occurred to the
Security Group.

### Subscribe Handler to SNS Topic

In order to connect AWS Config changes to the Labmda function, a subscription must
be added to the SNS topic provided to AWS Config. Add the Lambda function as a
subscription to the SNS topic.

## AWS Config

**If AWS Config is already enabled and tracking/recording changes**:

- Verify that "EC2: SecurityGroup" is included as a resource for which changes 
are recorded.
- Verify that changes are being sent to the desired SNS topic

**IF AWS Config has not been enabled/configured**:

- Enable AWS Config
- Include "EC2: SecurityGroup" as a resource type for which to record changes
- Choose where AWS Config should store log files
- Enable changes to be streamed to an SNS topic

**Verify AWS Config's Recording is on**

## Test Plan

1. Ensure a security group exists that has a tag with a key of "NotifyOnChange"
and a value of "Yes" and a tag with a key of "OwnerDL" and a value of the email
to which the notification should be sent.
1. Add a new Inbound Rule to the security group.
1. Within 10 minutes, an email should be sent to email address specified in the
"OwnerDL" tag.