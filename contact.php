<?php
// Minimal contact form handler for bruxellessolo.be
// Sends the message to the project mailbox without exposing it in HTML.

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo "Method not allowed";
  exit;
}

function clean($s) {
  $s = trim($s ?? '');
  $s = str_replace(["\r", "\n"], ' ', $s);
  return $s;
}

$name = clean($_POST['name'] ?? '');
$email = clean($_POST['email'] ?? '');
$place = clean($_POST['place'] ?? '');
$why = trim($_POST['why'] ?? '');
$details = trim($_POST['details'] ?? '');

if ($name === '' || $email === '' || $place === '' || $why === '') {
  http_response_code(400);
  echo "Missing required fields";
  exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400);
  echo "Invalid email";
  exit;
}

$to = 'thom@bruxellesensolo.be';
$subject = 'Bruxelles Solo — suggestion de lieu';

$body = "Nouvelle suggestion Bruxelles Solo\n\n" .
        "Nom: {$name}\n" .
        "Email: {$email}\n" .
        "Lieu: {$place}\n\n" .
        "Pourquoi c'est solo-friendly:\n{$why}\n\n" .
        "Détails:\n{$details}\n";

$headers = [];
$headers[] = 'From: Bruxelles Solo <no-reply@bruxellessolo.be>';
$headers[] = 'Reply-To: ' . $email;
$headers[] = 'Content-Type: text/plain; charset=UTF-8';

@mail($to, $subject, $body, implode("\r\n", $headers));

header('Location: /merci.html', true, 303);
exit;
?>
