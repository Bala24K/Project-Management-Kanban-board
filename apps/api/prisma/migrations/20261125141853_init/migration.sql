-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('backlog', 'todo', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "assignee" VARCHAR(60) NOT NULL DEFAULT '',
    "status" "Status" NOT NULL DEFAULT 'backlog',
    "position" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_status_position_idx" ON "Task"("status", "position");
