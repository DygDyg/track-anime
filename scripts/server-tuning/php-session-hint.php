<?php
/**
 * Вызовите сразу после session_start(), если дальше идёт долгая работа
 * (API, файлы, sleep). Иначе другие вкладки того же пользователя ждут lock.
 *
 *   session_start();
 *   $userId = $_SESSION['user_id'] ?? null;
 *   session_write_close();
 */
declare(strict_types=1);
