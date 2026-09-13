/*
 * Exec libfreenet.so with dumpable=0 so a rust SIGABRT does not raise
 * Samsung's "Application crashed" for com.sentinut.farm. The :freenet
 * service stays a normal Android process and stopSelfs when the child
 * dies. Plans/FREENET_NETWORK_PACK.md Phase 3.
 */
#include <sys/prctl.h>
#include <unistd.h>

#ifndef PR_SET_DUMPABLE
#define PR_SET_DUMPABLE 4
#endif

int main(int argc, char **argv) {
    if (argc < 2) return 127;
    prctl(PR_SET_DUMPABLE, 0, 0, 0, 0);
    execv(argv[1], argv + 1);
    return 127;
}
