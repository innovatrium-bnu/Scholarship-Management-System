<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

/**
 * Seeds a usable database.
 *
 * Reference data is not demo data — schools, programmes, batches, semesters,
 * quotas, geography and the four core fee heads are what the application needs
 * to function at all, in production as much as here. It runs unconditionally,
 * and so do the accounts.
 *
 * The demo register runs too, and refuses itself where it should not: DemoSeeder
 * returns without writing anything in production, and without writing anything
 * over a register that already holds students. Wiring it in rather than leaving
 * it to be remembered is the difference between `migrate:fresh --seed` producing
 * an application you can look at and one that renders eight correct empty states.
 *
 * Set DEMO_STUDENTS to change the size, or skip it entirely with
 * `db:seed --class=ReferenceSeeder` followed by `--class=UserSeeder`.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $this->call(ReferenceSeeder::class);
        $this->call(UserSeeder::class);
        $this->call(DemoSeeder::class);
    }
}
